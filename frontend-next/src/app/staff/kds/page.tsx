'use client';

import { useEffect, useState } from 'react';
import { orderApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  menuItemId?: string;
  quantity: number;
  status?: string;
  note?: string;
}

interface Order {
  id: string;
  status: string;
  customerName?: string;
  orderItems?: OrderItem[];
}

export default function KDSPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  const load = () =>
    orderApi.list().then((all) => {
      setOrders(all.filter((o) => o.status === 'PREPARING' || o.status === 'PENDING'));
    }).catch(() => {});

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const markItemDone = async (orderId: string, itemId: string) => {
    try {
      await orderApi.updateItemStatus(orderId, itemId, 'DONE');
      toast.success('Món đã xong');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const markOrderReady = async (orderId: string) => {
    try {
      await orderApi.updateStatus(orderId, 'READY');
      toast.success('Đơn sẵn sàng');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">KDS - Màn hình bếp</h1>
        <button onClick={load} className="text-sm text-brand-600 hover:text-brand-800 font-medium">
          Làm mới
        </button>
      </div>

      {orders.length === 0 && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-lg">Không có đơn cần pha chế</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.map((order) => {
          const allDone = order.orderItems?.every((i: OrderItem) => i.status === 'DONE');
          return (
            <div
              key={order.id}
              className={`rounded-xl border-2 p-4 ${
                order.status === 'PENDING' ? 'border-yellow-300 bg-yellow-50' : 'border-blue-300 bg-blue-50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-lg">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{order.customerName || 'Khách'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  order.status === 'PENDING' ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'
                }`}>
                  {order.status}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {order.orderItems?.map((item: OrderItem) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      item.status === 'DONE' ? 'bg-green-100 line-through opacity-60' : 'bg-white'
                    }`}
                  >
                    <div>
                      <span className="font-medium text-sm">{item.menuItemId?.slice(0, 8)}</span>
                      <span className="text-xs text-gray-500 ml-2">x{item.quantity}</span>
                      {item.note && <p className="text-xs text-orange-600 mt-0.5">{item.note}</p>}
                    </div>
                    {item.status !== 'DONE' && (
                      <button
                        onClick={() => markItemDone(order.id, item.id)}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition"
                      >
                        Xong
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Mark whole order ready */}
              {allDone && order.status === 'PREPARING' && (
                <button
                  onClick={() => markOrderReady(order.id)}
                  className="w-full mt-3 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                >
                  Sẵn sàng phục vụ
                </button>
              )}

              {order.status === 'PENDING' && (
                <button
                  onClick={() => orderApi.updateStatus(order.id, 'PREPARING').then(load)}
                  className="w-full mt-3 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                >
                  Bắt đầu pha chế
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
