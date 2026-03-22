import { useUiStore } from '@/stores/uiStore'

const dictionary = {
  appName: { vi: 'Coffee Shop', en: 'Coffee Shop' },
  dashboard: { vi: 'Tổng quan', en: 'Tổng quan' },
  menuManagement: { vi: 'Thực đơn', en: 'Thực đơn' },
  tables: { vi: 'Bàn', en: 'Bàn' },
  orders: { vi: 'Đơn hàng / POS', en: 'Đơn hàng / POS' },
  payments: { vi: 'Thanh toán', en: 'Thanh toán' },
  inventory: { vi: 'Kho', en: 'Kho' },
  promotions: { vi: 'Khuyến mãi', en: 'Khuyến mãi' },
  reports: { vi: 'Báo cáo', en: 'Báo cáo' },
  staff: { vi: 'Nhân sự', en: 'Nhân sự' },
  branches: { vi: 'Chi nhánh', en: 'Chi nhánh' },
  kitchen: { vi: 'Bếp', en: 'Bếp' },
  chat: { vi: 'Trò chuyện', en: 'Trò chuyện' },
  settings: { vi: 'Cài đặt', en: 'Cài đặt' },
  realtimeOn: { vi: 'Thời gian thực: Bật', en: 'Thời gian thực: Bật' },
  realtimeOff: { vi: 'Thời gian thực: Tắt', en: 'Thời gian thực: Tắt' },
  darkMode: { vi: 'Giao diện tối', en: 'Giao diện tối' },
  logout: { vi: 'Đăng xuất', en: 'Đăng xuất' },
  language: { vi: 'Ngôn ngữ', en: 'Ngôn ngữ' },
  mobileMenu: { vi: 'Mở menu điều hướng', en: 'Mở menu điều hướng' },
  loadingInterface: { vi: 'Đang tải giao diện...', en: 'Đang tải giao diện...' },
} as const

type TranslationKey = keyof typeof dictionary

export function useI18n() {
  const language = useUiStore((state) => state.language)
  const setLanguage = useUiStore((state) => state.setLanguage)

  return {
    language,
    setLanguage,
    t: (key: TranslationKey) => dictionary[key]?.vi ?? String(key),
    tv: (vi: string, _en: string) => vi,
  }
}
