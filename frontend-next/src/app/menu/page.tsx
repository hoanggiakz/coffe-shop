'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { menuApi, orderApi, formatVND } from '@/lib/api';
import toast from 'react-hot-toast';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: string;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  note?: string;
}

function MenuContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get('tableId') || '';

  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    menuApi.list().then(setItems).catch(() => toast.error('Không tải được menu')).finally(() => setLoading(false));
  }, []);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
    toast.success(`Đã thêm ${item.name}`);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => c.menuItem.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter((c) => c.quantity > 0),
    );
  };

  const total = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);

  const placeOrder = async () => {
    if (!tableId) return toast.error('Không tìm thấy bàn');
    if (cart.length === 0) return toast.error('Giỏ hàng trống');
    setOrdering(true);
    try {
      await orderApi.create({
        tableId,
        customerName: customerName || undefined,
        items: cart.map((c) => ({ menuItemId: c.menuItem.id, quantity: c.quantity, note: c.note })),
      });
      toast.success('Đặt hàng thành công!');
      setCart([]);
    } catch (e: any) {
      toast.error(e.message || 'Đặt hàng thất bại');
    } finally {
      setOrdering(false);
    }
  };

  // Group by category
  const categories = Array.from(new Set(items.map((i) => i.category)));

  if (loading) return <div className="flex justify-center items-center min-h-screen"><p className="text-lg">Đang tải menu...</p></div>;

  return (
    <div className="min-h-screen bg-brand-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-800">Menu</h1>
        {tableId && <span className="text-sm text-gray-500">Bàn: {tableId.slice(0, 8)}...</span>}
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-40">
        {/* Customer name */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Tên của bạn (tuỳ chọn)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Menu items */}
        {categories.map((cat) => (
          <section key={cat} className="mt-6">
            <h2 className="text-lg font-semibold text-brand-700 capitalize mb-3">{cat}</h2>
            <div className="grid gap-3">
              {items.filter((i) => i.category === cat).map((item) => (
                <div key={item.id} className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm">
                  <div className="w-16 h-16 bg-brand-100 rounded-lg flex items-center justify-center text-2xl">
                    ☕
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{item.name}</h3>
                    {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                    <p className="text-brand-600 font-semibold mt-1">{formatVND(item.price)}</p>
                  </div>
                  <button
                    onClick={() => addToCart(item)}
                    className="shrink-0 w-10 h-10 rounded-full bg-brand-600 text-white text-xl flex items-center justify-center hover:bg-brand-700 transition"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Cart drawer */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 max-w-2xl mx-auto">
          <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
            {cart.map((c) => (
              <div key={c.menuItem.id} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{c.menuItem.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(c.menuItem.id, -1)} className="w-7 h-7 rounded-full border flex items-center justify-center">−</button>
                  <span className="w-6 text-center">{c.quantity}</span>
                  <button onClick={() => updateQty(c.menuItem.id, 1)} className="w-7 h-7 rounded-full border flex items-center justify-center">+</button>
                  <span className="w-24 text-right font-medium">{formatVND(c.menuItem.price * c.quantity)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-bold text-lg">Tổng: {formatVND(total)}</span>
            <button
              onClick={placeOrder}
              disabled={ordering}
              className="bg-brand-600 text-white px-8 py-2.5 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {ordering ? 'Đang đặt...' : 'Đặt hàng'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><p>Đang tải...</p></div>}>
      <MenuContent />
    </Suspense>
  );
}
