'use client';

import { useEffect, useState } from 'react';
import { orderApi, formatVND } from '@/lib/api';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  menuItemId?: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  tableId?: string;
  totalAmount: number;
  orderItems?: OrderItem[];
}

const STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED'],
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('ALL');

  const load = () => orderApi.list().then(setOrders).catch(() => toast.error('Lỗi tải đơn'));
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await orderApi.updateStatus(id, status);
      toast.success('Cập nhật thành công');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const filtered = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);
  const tabs = ['ALL', 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Quản lý đơn hàng</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
              filter === t ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t === 'ALL' ? 'Tất cả' : t} {t !== 'ALL' && `(${orders.filter((o) => o.status === t).length})`}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="space-y-4">
        {filtered.map((order) => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold">#{order.id.slice(0, 8)}</p>
                <p className="text-sm text-gray-500">{order.customerName || 'Khách'} {order.customerPhone ? `- ${order.customerPhone}` : ''}</p>
                <p className="text-xs text-gray-400 mt-1">Bàn: {order.tableId?.slice(0, 8)}...</p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                  order.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' :
                  order.status === 'READY' ? 'bg-green-100 text-green-800' :
                  order.status === 'COMPLETED' ? 'bg-gray-100 text-gray-600' :
                  'bg-red-100 text-red-800'
                }`}>{order.status}</span>
                <p className="text-lg font-bold mt-2">{formatVND(order.totalAmount)}</p>
              </div>
            </div>

            {/* Items */}
            {order.orderItems && (
              <div className="border-t pt-3 space-y-1">
                {order.orderItems.map((item: OrderItem) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.menuItemId?.slice(0, 8)} x{item.quantity}</span>
                    <span className="text-gray-600">{formatVND(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {STATUS_FLOW[order.status] && (
              <div className="flex gap-2 mt-4 border-t pt-3">
                {STATUS_FLOW[order.status].map((next) => (
                  <button
                    key={next}
                    onClick={() => updateStatus(order.id, next)}
                    className={`text-xs px-4 py-1.5 rounded-lg font-medium transition ${
                      next === 'CANCELLED'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                    }`}
                  >
                    {next}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-12">Không có đơn hàng</p>
        )}
      </div>
    </div>
  );
}
