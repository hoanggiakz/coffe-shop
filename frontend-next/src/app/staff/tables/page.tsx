'use client';

import { useEffect, useState } from 'react';
import { tableApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Table {
  id: string;
  number: number;
  capacity: number;
  area?: string;
  status: string;
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ number: '', capacity: '4', area: '' });
  const [qrModal, setQrModal] = useState<{ id: string; qr: string } | null>(null);

  const load = () => tableApi.list().then(setTables).catch(() => toast.error('Lỗi tải bàn'));

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await tableApi.create({ number: Number(form.number), capacity: Number(form.capacity), area: form.area || undefined });
      toast.success('Tạo bàn thành công');
      setShowCreate(false);
      setForm({ number: '', capacity: '4', area: '' });
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await tableApi.updateStatus(id, status);
      toast.success('Cập nhật trạng thái');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const showQr = async (id: string) => {
    try {
      const res = await tableApi.getQr(id);
      setQrModal({ id, qr: res.qrCode });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const statuses = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'];
  const statusColor: Record<string, string> = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-200',
    OCCUPIED: 'bg-red-100 text-red-800 border-red-200',
    RESERVED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    CLEANING: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quản lý bàn</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition">
          + Thêm bàn
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Số bàn</label>
            <input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="border rounded-lg px-3 py-2 w-24 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sức chứa</label>
            <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="border rounded-lg px-3 py-2 w-24 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Khu vực</label>
            <input type="text" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="VD: Tầng 1" className="border rounded-lg px-3 py-2 w-32 text-sm" />
          </div>
          <button onClick={handleCreate} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">Tạo</button>
        </div>
      )}

      {/* Table grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {tables.map((t) => (
          <div key={t.id} className={`rounded-xl border-2 p-4 ${statusColor[t.status] || 'bg-white'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg">Bàn {t.number}</h3>
              <span className="text-xs font-medium">{t.capacity} chỗ</span>
            </div>
            {t.area && <p className="text-xs mb-2">{t.area}</p>}
            <p className="text-xs font-semibold mb-3">{t.status}</p>

            <div className="flex flex-wrap gap-1">
              {statuses.filter((s) => s !== t.status).map((s) => (
                <button key={s} onClick={() => handleStatus(t.id, s)} className="text-[10px] px-2 py-1 rounded bg-white/60 hover:bg-white transition">
                  {s}
                </button>
              ))}
              <button onClick={() => showQr(t.id)} className="text-[10px] px-2 py-1 rounded bg-white/60 hover:bg-white transition font-semibold">
                QR
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrModal(null)}>
          <div className="bg-white rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Mã QR</h3>
            <img src={qrModal.qr} alt="QR Code" className="w-64 h-64 mx-auto" />
            <p className="text-xs text-gray-500 mt-3">Khách quét mã để xem menu</p>
            <button onClick={() => setQrModal(null)} className="mt-4 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
