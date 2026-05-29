import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentService } from './payment.service';

@Controller()
export class InvoiceController {
  constructor(private readonly paymentService: PaymentService) {}

  private actor(req: Request) {
    return {
      role: String(req.headers['x-actor-role'] || ''),
      branchId: String(req.headers['x-actor-branch-id'] || ''),
      userId: String(req.headers['x-actor-user-id'] || ''),
    };
  }

  @Get('branches/:branchId/invoices')
  listBranchInvoices(
    @Param('branchId') branchId: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Req() req?: Request,
  ) {
    return this.paymentService.listInvoices(
      branchId,
      { start_date, end_date, status, page: Number(page), limit: Number(limit) },
      this.actor(req!),
    );
  }

  @Get('invoices/:id')
  getInvoiceDetail(@Param('id') id: string, @Req() req?: Request) {
    return this.paymentService.getInvoiceDetail(id, this.actor(req!));
  }

  @Get('invoices/:id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadInvoicePdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const invoice = await this.paymentService.getInvoiceDetail(id, this.actor(req));
    if (invoice.pdfUrl) {
      return res.redirect(invoice.pdfUrl);
    }
    const content = await this.paymentService.getInvoicePdf(id, this.actor(req));
    return res.send(content);
  }

  @Post('invoices/:id/void')
  voidInvoice(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req?: Request) {
    return this.paymentService.voidInvoice(id, String(body?.reason || ''), this.actor(req!));
  }

  @Post('orders/:orderId/invoice/regenerate')
  regenerateInvoice(@Param('orderId') orderId: string, @Req() req?: Request) {
    return this.paymentService.regenerateInvoice(orderId, this.actor(req!));
  }

  @Get('public/orders/:orderId/invoice-link')
  getPublicInvoiceLinkByOrder(@Param('orderId') orderId: string) {
    return this.paymentService.getPublicInvoiceLinkByOrder(orderId);
  }

  @Get('public/invoices/:id')
  getPublicInvoiceDetail(@Param('id') id: string, @Query('token') token = '') {
    return this.paymentService.getPublicInvoiceDetail(id, String(token || ''));
  }

  @Get('public/invoices/:id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPublicInvoicePdf(@Param('id') id: string, @Query('token') token = '', @Res() res: Response) {
    const content = await this.paymentService.getPublicInvoicePdf(id, String(token || ''));
    return res.send(content);
  }
}
