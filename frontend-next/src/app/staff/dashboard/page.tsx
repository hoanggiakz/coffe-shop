'use client';

import { useEffect, useState } from 'react';
import { orderApi, tableApi, formatVND } from '@/lib/api';

export default function DashboardPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);

  useEffect(() => {
    orderApi.list().then(setOrders).catch(() => {});
    tableApi.list().then(setTables).catch(() => {});
  }, []);

  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const preparing = orders.filter((o) => o.status === 'PREPARING').length;
  const ready = orders.filter((o) => o.status === 'READY').length;
  const todayRevenue = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((s: number, o: any) => s + o.totalAmount, 0);

  const stats = [
    { label: 'Đơn chờ xác nhận', value: pending, color: 'bg-yellow-100 text-yellow-800' },
    { label: 'Đang pha chế', value: preparing, color: 'bg-blue-100 text-blue-800' },
    { label: 'Sẵn sàng phục vụ', value: ready, color: 'bg-green-100 text-green-800' },
    { label: 'Doanh thu hôm nay', value: formatVND(todayRevenue), color: 'bg-brand-100 text-brand-800' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl p-5 ${s.color}`}>
            <p className="text-sm font-medium opacity-80">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-lg mb-4">Đơn hàng gần đây</h2>
          {orders.slice(0, 5).map((o) => (
            <div key={o.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">#{o.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-500">{o.customerName || 'Khách'}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  o.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                  o.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' :
                  o.status === 'READY' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>{o.status}</span>
                <p className="text-sm font-semibold mt-1">{formatVND(o.totalAmount)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tables overview */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-lg mb-4">Tổng quan bàn</h2>
          <div className="grid grid-cols-4 gap-2">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg p-3 text-center text-sm font-medium ${
                  t.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                  t.status === 'OCCUPIED' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}
              >
                Bàn {t.number}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
