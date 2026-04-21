import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as ExcelJS from 'exceljs';
import {
  DashboardQueryDto,
  ExportFormat,
  ExportReportQueryDto,
  ExportReportType,
  InventoryReportQueryDto,
  RevenueReportQueryDto,
  StaffPerformanceQueryDto,
  TimeGroup,
  TopItemsQueryDto,
} from './dto/report-query.dto';
import { CustomLogger } from '../../common/logger.service';

type DateRange = { from?: string; to?: string; dateFrom?: string; dateTo?: string; branchId?: string };
type WhereBuildResult = { clause: string; params: any[] };

const PDFDocument = require('pdfkit');

@Injectable()
export class ReportsService implements OnModuleDestroy {
  private readonly orderPool: Pool;
  private readonly inventoryPool: Pool;
  private readonly paymentPool: Pool;
  private readonly userPool: Pool;

  constructor(
    private readonly configService: ConfigService,
    @Inject('CustomLogger') private readonly logger: CustomLogger,
  ) {
    this.orderPool = this.createPool(this.resolveDatabaseUrl('ORDER_DATABASE_URL', 'orderdb'));
    this.inventoryPool = this.createPool(this.resolveDatabaseUrl('INVENTORY_DATABASE_URL', 'inventorydb'));
    this.paymentPool = this.createPool(this.resolveDatabaseUrl('PAYMENT_DATABASE_URL', 'paymentdb'));
    this.userPool = this.createPool(this.resolveDatabaseUrl('USER_DATABASE_URL', 'userdb'));
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.orderPool.end(),
      this.inventoryPool.end(),
      this.paymentPool.end(),
      this.userPool.end(),
    ]);
  }

  async getRevenueReport(query: RevenueReportQueryDto = {}) {
    const groupBy = query.groupBy || 'day';
    const series = await this.getRevenueSeries(query, groupBy);
    const byItem = await this.getTopItems(query);
    const byStaff = await this.getStaffPerformance(query);

    const summary = series.reduce(
      (acc, item) => {
        acc.totalRevenue += item.revenue;
        acc.totalOrders += item.orderCount;
        return acc;
      },
      { totalRevenue: 0, totalOrders: 0 },
    );

    return {
      range: this.buildRangeResponse(query),
      groupBy,
      summary: {
        totalRevenue: summary.totalRevenue,
        totalOrders: summary.totalOrders,
        averageOrderValue: summary.totalOrders > 0 ? Math.round(summary.totalRevenue / summary.totalOrders) : 0,
      },
      series,
      byItem,
      byStaff: byStaff.items,
    };
  }

  async getTopItems(query: TopItemsQueryDto = {}) {
    const limit = Math.max(1, Math.min(Number(query.limit || 10), 100));
    const dateWhere = this.buildDateWhere('o."createdAt"', query.dateFrom, query.dateTo);
    const branchId = this.normalizeBranchId(query.branchId);
    const whereParts = ['o.status = \'COMPLETED\''];
    const whereParams = [...dateWhere.params];
    if (dateWhere.clause) {
      whereParts.push(dateWhere.clause);
    }
    if (branchId) {
      whereParams.push(branchId);
      whereParts.push(`o."branchId" = $${whereParams.length}`);
    }

    const sql = `
      SELECT
        oi."menuItemId" AS "menuItemId",
        COALESCE(mi.name, oi."menuItemId") AS "menuItemName",
        COALESCE(SUM(oi.quantity), 0)::bigint AS quantity,
        COALESCE(SUM(oi.quantity * oi.price), 0)::bigint AS revenue,
        COALESCE(COUNT(DISTINCT oi."orderId"), 0)::int AS "orderCount"
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      LEFT JOIN menu_items mi ON mi.id = oi."menuItemId"
      WHERE ${whereParts.join(' AND ')}
      GROUP BY oi."menuItemId", mi.name
      ORDER BY quantity DESC, revenue DESC
      LIMIT $${whereParams.length + 1}
    `;

    const rows = await this.orderPool.query(sql, [...whereParams, limit]);
    return rows.rows.map((row) => ({
      menuItemId: String(row.menuItemId),
      menuItemName: String(row.menuItemName || row.menuItemId),
      quantity: Number(row.quantity || 0),
      revenue: Number(row.revenue || 0),
      orderCount: Number(row.orderCount || 0),
    }));
  }

  async getInventoryReport(query: InventoryReportQueryDto = {}) {
    const includeMovements = query.includeMovements !== false;
    const movementLimit = Math.max(1, Math.min(Number(query.movementLimit || 300), 2000));
    const branchId = this.normalizeBranchId(query.branchId);
    const stockWhereClause = branchId ? 'WHERE i."branchId" = $1' : '';

    const stockRows = await this.inventoryPool.query(
      `
      SELECT
        i.id,
        i.name,
        i.unit,
        COALESCE(i.stock, 0)::numeric AS stock,
        COALESCE(i."minStock", 0)::numeric AS "minStock",
        COALESCE(i."importPrice", 0)::numeric AS "importPrice",
        COALESCE((i.stock * i."importPrice"), 0)::numeric AS "stockValue",
        i."isActive" AS "isActive"
      FROM ingredients i
      ${stockWhereClause}
      ORDER BY i.name ASC
    `,
      branchId ? [branchId] : [],
    );

    const stocks = stockRows.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      unit: String(row.unit || ''),
      stock: Number(row.stock || 0),
      minStock: Number(row.minStock || 0),
      importPrice: Number(row.importPrice || 0),
      stockValue: Number(row.stockValue || 0),
      isActive: Boolean(row.isActive),
      isLowStock: Number(row.stock || 0) < Number(row.minStock || 0),
    }));

    const summary = {
      totalIngredients: stocks.length,
      activeIngredients: stocks.filter((item) => item.isActive).length,
      lowStockCount: stocks.filter((item) => item.isLowStock).length,
      totalStockValue: stocks.reduce((acc, item) => acc + item.stockValue, 0),
    };

    let movements: Array<Record<string, any>> = [];
    let movementSummary: Array<Record<string, any>> = [];

    if (includeMovements) {
      const dateWhere = this.buildDateWhere('sm."createdAt"', query.dateFrom, query.dateTo);
      const movementConditions: string[] = [];
      const movementParams: any[] = [];

      if (dateWhere.clause) {
        movementConditions.push(dateWhere.clause);
        movementParams.push(...dateWhere.params);
      }

      if (branchId) {
        movementParams.push(branchId);
        movementConditions.push(`sm."branchId" = $${movementParams.length}`);
      }

      const movementWhere = movementConditions.length ? `WHERE ${movementConditions.join(' AND ')}` : '';

      const movementRows = await this.inventoryPool.query(
        `
          SELECT
            sm.id,
            sm."ingredientId" AS "ingredientId",
            i.name AS "ingredientName",
            sm.type,
            sm.source,
            COALESCE(sm.quantity, 0)::numeric AS quantity,
            COALESCE(sm."unitPrice", 0)::numeric AS "unitPrice",
            COALESCE(sm."totalPrice", 0)::numeric AS "totalPrice",
            sm.reason,
            sm.note,
            sm."createdBy" AS "createdBy",
            sm."createdAt" AS "createdAt"
          FROM stock_movements sm
          INNER JOIN ingredients i ON i.id = sm."ingredientId"
          ${movementWhere}
          ORDER BY sm."createdAt" DESC
          LIMIT $${movementParams.length + 1}
        `,
        [...movementParams, movementLimit],
      );

      movements = movementRows.rows.map((row) => ({
        id: String(row.id),
        ingredientId: String(row.ingredientId),
        ingredientName: String(row.ingredientName),
        type: String(row.type),
        source: String(row.source),
        quantity: Number(row.quantity || 0),
        unitPrice: Number(row.unitPrice || 0),
        totalPrice: Number(row.totalPrice || 0),
        reason: row.reason ? String(row.reason) : null,
        note: row.note ? String(row.note) : null,
        createdBy: row.createdBy ? String(row.createdBy) : null,
        createdAt: row.createdAt,
      }));

      const movementSummaryRows = await this.inventoryPool.query(
        `
          SELECT
            sm.type,
            COALESCE(SUM(sm.quantity), 0)::numeric AS quantity,
            COALESCE(SUM(sm."totalPrice"), 0)::numeric AS "totalPrice"
          FROM stock_movements sm
          ${movementWhere}
          GROUP BY sm.type
          ORDER BY sm.type
        `,
        movementParams,
      );

      movementSummary = movementSummaryRows.rows.map((row) => ({
        type: String(row.type),
        quantity: Number(row.quantity || 0),
        totalPrice: Number(row.totalPrice || 0),
      }));
    }

    return {
      range: this.buildRangeResponse(query),
      summary,
      stocks,
      movementSummary,
      movements,
    };
  }

  async getStaffPerformance(query: StaffPerformanceQueryDto = {}) {
    const limit = Math.max(1, Math.min(Number(query.limit || 20), 100));
    const branchId = this.normalizeBranchId(query.branchId);
    const dateWhere = this.buildDateWhere('COALESCE(p."paidAt", p."createdAt")', query.dateFrom, query.dateTo);
    let scopedOrderIds: string[] | null = null;

    if (branchId) {
      const orderDateWhere = this.buildDateWhere('o."createdAt"', query.dateFrom, query.dateTo);
      const orderConditions = ['o.status = \'COMPLETED\''];
      const orderParams = [...orderDateWhere.params];
      if (orderDateWhere.clause) {
        orderConditions.push(orderDateWhere.clause);
      }

      orderParams.push(branchId);
      orderConditions.push(`o."branchId" = $${orderParams.length}`);

      const scopedOrders = await this.orderPool.query(
        `
          SELECT o.id::text AS id
          FROM orders o
          WHERE ${orderConditions.join(' AND ')}
        `,
        orderParams,
      );

      scopedOrderIds = scopedOrders.rows.map((row) => String(row.id));
      if (!scopedOrderIds.length) {
        return {
          range: this.buildRangeResponse(query),
          totals: { totalOrders: 0, totalRevenue: 0 },
          items: [],
        };
      }
    }

    const whereParts = ['p.status = \'PAID\''];
    const whereParams = [...dateWhere.params];
    if (dateWhere.clause) {
      whereParts.push(dateWhere.clause);
    }
    if (scopedOrderIds) {
      whereParams.push(scopedOrderIds);
      whereParts.push(`p."orderId" = ANY($${whereParams.length}::text[])`);
    }

    const sql = `
      SELECT
        COALESCE(NULLIF(p.metadata->>'confirmedBy', ''), 'SYSTEM') AS "staffId",
        COUNT(*)::int AS "orderCount",
        COALESCE(SUM(p.amount), 0)::numeric AS revenue
      FROM payments p
      WHERE ${whereParts.join(' AND ')}
      GROUP BY "staffId"
      ORDER BY revenue DESC, "orderCount" DESC
      LIMIT $${whereParams.length + 1}
    `;

    const rows = await this.paymentPool.query(sql, [...whereParams, limit]);
    const normalized = rows.rows.map((row) => ({
      staffId: String(row.staffId),
      orderCount: Number(row.orderCount || 0),
      revenue: Number(row.revenue || 0),
    }));

    const staffIds = normalized
      .map((item) => item.staffId)
      .filter((id) => id && id !== 'SYSTEM');

    const staffMap = new Map<string, { name: string | null; email: string | null; role: string | null }>();
    if (staffIds.length) {
      const staffRows = await this.userPool.query(
        `
          SELECT id::text AS id, name, email, role
          FROM users
          WHERE id::text = ANY($1::text[])
        `,
        [staffIds],
      );

      for (const row of staffRows.rows) {
        staffMap.set(String(row.id), {
          name: row.name ? String(row.name) : null,
          email: row.email ? String(row.email) : null,
          role: row.role ? String(row.role) : null,
        });
      }
    }

    const items = normalized.map((item) => {
      const staff = staffMap.get(item.staffId);
      return {
        staffId: item.staffId,
        staffName: staff?.name || (item.staffId === 'SYSTEM' ? 'System / Unknown' : item.staffId),
        email: staff?.email || null,
        role: staff?.role || null,
        orderCount: item.orderCount,
        revenue: item.revenue,
      };
    });

    const totals = items.reduce(
      (acc, item) => {
        acc.totalOrders += item.orderCount;
        acc.totalRevenue += item.revenue;
        return acc;
      },
      { totalOrders: 0, totalRevenue: 0 },
    );

    return {
      range: this.buildRangeResponse(query),
      totals,
      items,
    };
  }

  async getDashboard(query: DashboardQueryDto = {}) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(now.getDate() - 6);

    const dateFrom = query.dateFrom || defaultFrom.toISOString().slice(0, 10);
    const dateTo = query.dateTo || now.toISOString().slice(0, 10);
    const branchId = this.normalizeBranchId(query.branchId);

    const [revenue, topItems, inventory, orderStatus, hourlyOrders, staffPerformance, paymentOverview] = await Promise.all([
      this.getRevenueSeries({ dateFrom, dateTo, branchId }, query.groupBy || 'day'),
      this.getTopItems({ dateFrom, dateTo, limit: 10, branchId }),
      this.getInventoryReport({ dateFrom, dateTo, includeMovements: false, branchId }),
      this.getTodayOrderStatus(branchId || undefined),
      this.getHourlyOrders(branchId || undefined),
      this.getStaffPerformance({ dateFrom, dateTo, limit: 5, branchId }),
      this.getPaymentOverview({ dateFrom, dateTo, branchId }),
    ]);

    const revenueSummary = revenue.reduce(
      (acc, item) => {
        acc.totalRevenue += item.revenue;
        acc.totalOrders += item.orderCount;
        return acc;
      },
      { totalRevenue: 0, totalOrders: 0 },
    );

    return {
      updatedAt: new Date().toISOString(),
      range: this.buildRangeResponse({ dateFrom, dateTo, branchId }),
      revenue: {
        totalRevenue: revenueSummary.totalRevenue,
        totalOrders: revenueSummary.totalOrders,
        series: revenue,
      },
      orders: {
        todayByStatus: orderStatus,
        hourly: hourlyOrders,
      },
      payments: paymentOverview,
      inventory: {
        summary: inventory.summary,
        lowStockItems: inventory.stocks.filter((item) => item.isLowStock).slice(0, 10),
      },
      topItems,
      staffPerformance: staffPerformance.items,
    };
  }

  async getDailyStats(dateFrom?: string, dateTo?: string) {
    return this.getDashboard({ dateFrom, dateTo, groupBy: 'day' });
  }

  async exportReport(query: ExportReportQueryDto): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const reportType = query.reportType as ExportReportType;
    const format = query.format as ExportFormat;
    const dateToken = new Date().toISOString().replace(/[:.]/g, '-');
    const filenameBase = `${reportType}-${dateToken}`;

    const dataset = await this.buildExportDataset(reportType, query);
    if (format === 'excel') {
      const buffer = await this.buildExcelBuffer(reportType, dataset.rows);
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${filenameBase}.xlsx`,
      };
    }

    const buffer = await this.buildPdfBuffer(reportType, dataset.rows, dataset.title);
    return {
      buffer,
      contentType: 'application/pdf',
      filename: `${filenameBase}.pdf`,
    };
  }

  private async buildExportDataset(reportType: ExportReportType, query: ExportReportQueryDto) {
    if (reportType === 'revenue') {
      const revenue = await this.getRevenueReport({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchId: query.branchId,
        groupBy: query.groupBy,
      });
      return {
        title: 'Revenue Report',
        rows: revenue.series.map((item) => ({
          Period: item.period,
          Revenue: item.revenue,
          Orders: item.orderCount,
        })),
      };
    }

    if (reportType === 'top-items') {
      const items = await this.getTopItems({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchId: query.branchId,
        limit: query.limit || 10,
      });
      return {
        title: 'Top Selling Items',
        rows: items.map((item, index) => ({
          Rank: index + 1,
          MenuItemId: item.menuItemId,
          MenuItemName: item.menuItemName,
          Quantity: item.quantity,
          Revenue: item.revenue,
          Orders: item.orderCount,
        })),
      };
    }

    if (reportType === 'inventory') {
      const inventory = await this.getInventoryReport({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchId: query.branchId,
        includeMovements: query.includeMovements !== false,
      });
      const rows = inventory.stocks.map((item) => ({
        Ingredient: item.name,
        Unit: item.unit,
        Stock: item.stock,
        MinStock: item.minStock,
        IsLowStock: item.isLowStock ? 'YES' : 'NO',
        ImportPrice: item.importPrice,
        StockValue: item.stockValue,
      }));
      return { title: 'Inventory Report', rows };
    }

    if (reportType === 'staff-performance') {
      const staff = await this.getStaffPerformance({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchId: query.branchId,
        limit: query.limit || 20,
      });
      return {
        title: 'Staff Performance',
        rows: staff.items.map((item) => ({
          StaffId: item.staffId,
          StaffName: item.staffName,
          Role: item.role || '',
          Orders: item.orderCount,
          Revenue: item.revenue,
        })),
      };
    }

    const dashboard = await this.getDashboard({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      groupBy: query.groupBy,
    });
    return {
      title: 'Dashboard Snapshot',
      rows: dashboard.revenue.series.map((item) => ({
        Period: item.period,
        Revenue: item.revenue,
        Orders: item.orderCount,
      })),
    };
  }

  private async buildExcelBuffer(reportType: string, rows: Array<Record<string, any>>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportType);

    const keys = rows.length ? Object.keys(rows[0]) : ['NoData'];
    worksheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.max(14, key.length + 2),
    }));

    if (rows.length) {
      worksheet.addRows(rows);
    } else {
      worksheet.addRow({ NoData: 'No data available' });
    }

    worksheet.getRow(1).font = { bold: true };
    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.from(raw as ArrayBuffer);
  }

  private async buildPdfBuffer(
    reportType: string,
    rows: Array<Record<string, any>>,
    title: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      doc.fontSize(18).text(title, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(`Generated at: ${new Date().toISOString()}`);
      doc.moveDown(1);

      if (!rows.length) {
        doc.fontSize(12).fillColor('#111').text('No data available');
        doc.end();
        return;
      }

      const keys = Object.keys(rows[0]);
      doc.fontSize(11).fillColor('#111').text(keys.join(' | '));
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#444');

      rows.forEach((row) => {
        const line = keys
          .map((key) => {
            const value = row[key];
            if (value === null || value === undefined) return '';
            const text = String(value);
            return text.length > 40 ? `${text.slice(0, 37)}...` : text;
          })
          .join(' | ');
        doc.text(line);
      });

      doc.end();
      this.logger.log(`Generated PDF export for ${reportType}`);
    });
  }

  private async getRevenueSeries(range: DateRange, groupBy: TimeGroup) {
    const branchId = this.normalizeBranchId(range.branchId);
    const scopedOrderIds = await this.getScopedOrderIdsForBranch(branchId);
    if (branchId && scopedOrderIds && !scopedOrderIds.length) {
      return [];
    }

    const dateWhere = this.buildDateWhere(
      'COALESCE(p."paidAt", p."createdAt")',
      range.from || range.dateFrom,
      range.to || range.dateTo,
      1,
    );

    const whereParts = ['p.status = \'PAID\''];
    if (dateWhere.clause) {
      whereParts.push(dateWhere.clause);
    }

    const params: any[] = [groupBy, ...dateWhere.params];
    if (scopedOrderIds) {
      params.push(scopedOrderIds);
      whereParts.push(`p."orderId" = ANY($${params.length}::text[])`);
    }

    const sql = `
      SELECT
        date_trunc($1, COALESCE(p."paidAt", p."createdAt")) AS period_start,
        COALESCE(SUM(p.amount), 0)::numeric AS revenue,
        COUNT(*)::int AS "orderCount"
      FROM payments p
      WHERE ${whereParts.join(' AND ')}
      GROUP BY period_start
      ORDER BY period_start ASC
    `;

    const rows = await this.paymentPool.query(sql, params);
    return rows.rows.map((row) => ({
      period: new Date(row.period_start).toISOString(),
      revenue: Number(row.revenue || 0),
      orderCount: Number(row.orderCount || 0),
    }));
  }

  private async getPaymentOverview(range: DateRange) {
    const branchId = this.normalizeBranchId(range.branchId);
    const scopedOrderIds = await this.getScopedOrderIdsForBranch(branchId);
    if (branchId && scopedOrderIds && !scopedOrderIds.length) {
      return {
        summary: {
          totalTransactions: 0,
          paidTransactions: 0,
          pendingTransactions: 0,
          failedTransactions: 0,
          totalRevenue: 0,
          averagePaidValue: 0,
        },
        byProvider: [],
        byStatus: [],
      };
    }

    const dateWhere = this.buildDateWhere(
      'COALESCE(p."paidAt", p."createdAt")',
      range.from || range.dateFrom,
      range.to || range.dateTo,
    );

    const whereParts: string[] = [];
    const whereParams: any[] = [...dateWhere.params];

    if (dateWhere.clause) {
      whereParts.push(dateWhere.clause);
    }
    if (scopedOrderIds) {
      whereParams.push(scopedOrderIds);
      whereParts.push(`p."orderId" = ANY($${whereParams.length}::text[])`);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [summaryResult, providerResult, statusResult] = await Promise.all([
      this.paymentPool.query(
        `
          SELECT
            COUNT(*)::int AS "totalTransactions",
            COUNT(*) FILTER (WHERE p.status = 'PAID')::int AS "paidTransactions",
            COUNT(*) FILTER (WHERE p.status IN ('PENDING', 'WAITING_TRANSFER', 'WAITING_CASH'))::int AS "pendingTransactions",
            COUNT(*) FILTER (WHERE p.status IN ('FAILED', 'EXPIRED', 'CANCELLED'))::int AS "failedTransactions",
            COALESCE(SUM(CASE WHEN p.status = 'PAID' THEN p.amount ELSE 0 END), 0)::numeric AS "totalRevenue"
          FROM payments p
          ${whereClause}
        `,
        whereParams,
      ),
      this.paymentPool.query(
        `
          SELECT
            p.provider,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE p.status = 'PAID')::int AS "paidCount",
            COALESCE(SUM(CASE WHEN p.status = 'PAID' THEN p.amount ELSE 0 END), 0)::numeric AS revenue
          FROM payments p
          ${whereClause}
          GROUP BY p.provider
          ORDER BY revenue DESC, count DESC
        `,
        whereParams,
      ),
      this.paymentPool.query(
        `
          SELECT
            p.status,
            COUNT(*)::int AS count,
            COALESCE(SUM(p.amount), 0)::numeric AS amount
          FROM payments p
          ${whereClause}
          GROUP BY p.status
          ORDER BY count DESC, p.status ASC
        `,
        whereParams,
      ),
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    const paidTransactions = Number(summaryRow.paidTransactions || 0);
    const totalRevenue = Number(summaryRow.totalRevenue || 0);

    return {
      summary: {
        totalTransactions: Number(summaryRow.totalTransactions || 0),
        paidTransactions,
        pendingTransactions: Number(summaryRow.pendingTransactions || 0),
        failedTransactions: Number(summaryRow.failedTransactions || 0),
        totalRevenue,
        averagePaidValue: paidTransactions > 0 ? Math.round(totalRevenue / paidTransactions) : 0,
      },
      byProvider: providerResult.rows.map((row) => ({
        provider: String(row.provider || 'UNKNOWN'),
        count: Number(row.count || 0),
        paidCount: Number(row.paidCount || 0),
        revenue: Number(row.revenue || 0),
      })),
      byStatus: statusResult.rows.map((row) => ({
        status: String(row.status || 'UNKNOWN'),
        count: Number(row.count || 0),
        amount: Number(row.amount || 0),
      })),
    };
  }

  private async getScopedOrderIdsForBranch(branchId?: string | null): Promise<string[] | null> {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) {
      return null;
    }

    const rows = await this.orderPool.query(
      `
        SELECT o.id::text AS id
        FROM orders o
        WHERE o."branchId" = $1
      `,
      [normalizedBranchId],
    );

    return rows.rows.map((row) => String(row.id));
  }

  private async getTodayOrderStatus(branchId?: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    const whereParts = ['o."createdAt" >= date_trunc(\'day\', now())'];
    const params: any[] = [];
    if (normalizedBranchId) {
      params.push(normalizedBranchId);
      whereParts.push(`o."branchId" = $${params.length}`);
    }

    const rows = await this.orderPool.query(
      `
      SELECT
        o.status,
        COUNT(*)::int AS count
      FROM orders o
      WHERE ${whereParts.join(' AND ')}
      GROUP BY o.status
      ORDER BY o.status
    `,
      params,
    );

    return rows.rows.map((row) => ({
      status: String(row.status),
      count: Number(row.count || 0),
    }));
  }

  private async getHourlyOrders(branchId?: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    const whereParts = ['o."createdAt" >= (now() - interval \'24 hour\')'];
    const params: any[] = [];
    if (normalizedBranchId) {
      params.push(normalizedBranchId);
      whereParts.push(`o."branchId" = $${params.length}`);
    }

    const rows = await this.orderPool.query(
      `
      SELECT
        date_trunc('hour', o."createdAt") AS bucket,
        COUNT(*)::int AS orders,
        COALESCE(SUM(CASE WHEN o.status = 'COMPLETED' THEN o."totalAmount" ELSE 0 END), 0)::bigint AS revenue
      FROM orders o
      WHERE ${whereParts.join(' AND ')}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
      params,
    );

    return rows.rows.map((row) => ({
      timestamp: new Date(row.bucket).toISOString(),
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
    }));
  }

  private buildRangeResponse(range: DateRange) {
    const branchId = this.normalizeBranchId(range.branchId);
    return {
      dateFrom: range.from || range.dateFrom || null,
      dateTo: range.to || range.dateTo || null,
      branchId: branchId || null,
    };
  }

  private buildDateWhere(column: string, dateFrom?: string, dateTo?: string, startIndex = 0): WhereBuildResult {
    const params: any[] = [];
    const conditions: string[] = [];

    const startDate = this.parseDateStart(dateFrom);
    if (startDate) {
      params.push(startDate.toISOString());
      conditions.push(`${column} >= $${params.length + startIndex}::timestamp`);
    }

    const endDate = this.parseDateEnd(dateTo);
    if (endDate) {
      params.push(endDate.toISOString());
      conditions.push(`${column} <= $${params.length + startIndex}::timestamp`);
    }

    return {
      clause: conditions.join(' AND '),
      params,
    };
  }

  private parseDateStart(date?: string): Date | null {
    if (!date) return null;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseDateEnd(date?: string): Date | null {
    if (!date) return null;
    const parsed = new Date(`${date}T23:59:59.999Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeBranchId(branchId?: string | null): string | null {
    const normalized = String(branchId || '').trim();
    return normalized || null;
  }

  private resolveDatabaseUrl(envName: string, fallbackDbName: string): string {
    const direct = this.configService.get<string>(envName);
    if (direct) {
      return direct;
    }

    const base = this.configService.get<string>('DATABASE_URL', '');
    if (!base) {
      throw new Error(`Missing database url for ${envName}`);
    }

    try {
      const url = new URL(base);
      url.pathname = `/${fallbackDbName}`;
      return url.toString();
    } catch {
      throw new Error(`Invalid DATABASE_URL format: ${base}`);
    }
  }

  private createPool(connectionString: string) {
    return new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
}

