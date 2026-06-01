import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { disconnectSocket, getSocket } from '@/utils/socket'
import { useAuthStore } from '@/stores/authStore'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { showRealtimeNotification } from '@/utils/notifications'
import { ChatSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan } from '@/utils/display'

interface ChatItem {
  id: string
  tableId: string
  customerName?: string | null
  status: 'OPEN' | 'CLOSED'
  unreadCount?: number
  messages?: ChatMessage[]
  updatedAt?: string
}

interface TableApi {
  id: string
  number?: number | null
}

interface ChatMessage {
  id: string
  sessionId: string
  senderType: 'CUSTOMER' | 'STAFF'
  senderName: string
  content: string
  createdAt: string
}

type StaffNotificationType =
  | 'ORDER_NEW'
  | 'CALL_STAFF'
  | 'CHAT_MESSAGE'
  | 'CHAT_OPENED'
  | 'KDS_ITEM_STATUS'
  | 'KDS_ORDER_READY'
  | 'LOW_STOCK'

interface StaffNotificationPayload {
  id: string
  type: StaffNotificationType
  title: string
  message: string
  chatId?: string
}

const LAST_SEEN_STORAGE_KEY = 'staff-chat-last-seen'

function getLatestMessage(chat: ChatItem): ChatMessage | undefined {
  return Array.isArray(chat.messages) && chat.messages.length > 0 ? chat.messages[0] : undefined
}

function loadLastSeenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistLastSeenMap(map: Record<string, string>) {
  localStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(map))
}

function parseTaggedMeta(content: string, tag: string): Record<string, string> {
  const prefix = `[${tag}]`
  const raw = content.startsWith(prefix) ? content.slice(prefix.length).trim() : content
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const index = pair.indexOf('=')
      if (index <= 0) return acc
      const key = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (key) acc[key] = value
      return acc
    }, {})
}

interface FormattedMessage {
  preview: string
  detail: string
  type?: 'ORDER_NEW' | 'CALL_STAFF' | 'PLAIN'
  tableText?: string
  totalText?: string
  itemsText?: string
  orderId?: string
}

export default function ChatPage() {
  const user = useAuthStore((state) => state.user)
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const { tv } = useI18n()
  const effectiveBranchId = String(selectedBranchId || user?.branchId || '').trim()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [tables, setTables] = useState<TableApi[]>([])
  const [activeChatId, setActiveChatId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [newTableId, setNewTableId] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'ALL'>('OPEN')
  const [socketConnected, setSocketConnected] = useState(false)
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>(() => loadLastSeenMap())
  const activeChatIdRef = useRef('')
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const staffTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId],
  )

  const markChatSeen = (chatId: string, seenAt?: string) => {
    const timestamp = seenAt || new Date().toISOString()
    setLastSeenMap((prev) => {
      const next = { ...prev, [chatId]: timestamp }
      persistLastSeenMap(next)
      return next
    })
  }

  const hasUnread = (chat: ChatItem) => {
    if ((chat.unreadCount || 0) > 0) return true
    const latest = getLatestMessage(chat)
    if (!latest || latest.senderType !== 'CUSTOMER') return false
    const lastSeen = lastSeenMap[chat.id]
    if (!lastSeen) return true
    return new Date(latest.createdAt).getTime() > new Date(lastSeen).getTime()
  }

  const tableLabel = (tableId?: string) => {
    if (!tableId) return tv('Bàn không xác định', 'Unknown table')
    const matchedTable = tables.find((table) => table.id === tableId)
    if (matchedTable?.number !== null && matchedTable?.number !== undefined) {
      return `${tv('Bàn', 'Table')} ${matchedTable.number}`
    }
    return tv('Bàn không xác định', 'Unknown table')
  }

  const formatSystemMessage = (message: ChatMessage): FormattedMessage => {
    const content = String(message.content || '').trim()
    if (!content.startsWith('[')) {
      return {
        preview: `${message.senderName}: ${content}`,
        detail: content,
        type: 'PLAIN',
      }
    }

    if (content.startsWith('[ORDER_NEW]')) {
      const meta = parseTaggedMeta(content, 'ORDER_NEW')
      const tableText =
        meta.tableNumber && meta.tableNumber !== 'null' && meta.tableNumber !== 'undefined'
          ? `${tv('Bàn', 'Table')} ${meta.tableNumber}`
          : tableLabel(meta.tableId)
      const summary = meta.summary ? decodeURIComponent(meta.summary) : ''
      const total = Number(meta.total || 0)
      const items = Number(meta.items || 0)
      const preview = summary || `${tableText} • ${total.toLocaleString('vi-VN')}đ`
      return {
        preview: `${tv('Hệ thống', 'System')}: ${preview}`,
        detail: summary || `${tableText}\n${tv('Tổng tiền', 'Total')}: ${total.toLocaleString('vi-VN')}đ`,
        type: 'ORDER_NEW',
        tableText,
        totalText: `${total.toLocaleString('vi-VN')}đ`,
        itemsText: items > 0 ? `${items} ${tv('món', 'items')}` : undefined,
        orderId: meta.orderId || undefined,
      }
    }

    if (content.startsWith('[CALL_STAFF]')) {
      const reason = content.replace('[CALL_STAFF]', '').trim() || tv('Khách cần hỗ trợ tại bàn', 'Customer needs help at table')
      return {
        preview: `${tv('Hệ thống', 'System')}: ${reason}`,
        detail: reason,
        type: 'CALL_STAFF',
      }
    }

    return {
      preview: `${message.senderName}: ${content.replace(/\[[A-Z_]+\]\s*/, '')}`,
      detail: content.replace(/\[[A-Z_]+\]\s*/, ''),
      type: 'PLAIN',
    }
  }

  const loadChats = async () => {
    try {
      const branchId = effectiveBranchId
      const [chatRes, tableRes] = await Promise.all([
        branchId
          ? api.get(`/branches/${branchId}/chat/sessions?status=${statusFilter}&page=1&limit=100`)
          : api.get('/chats'),
        api.get('/tables', { params: { branchId: branchId || undefined } }),
      ])
      const nextChats: ChatItem[] = Array.isArray(chatRes.data) ? chatRes.data : []
      const nextTables: TableApi[] = Array.isArray(tableRes.data) ? tableRes.data : []
      setTables(nextTables)
      setChats(nextChats)

      if (!nextChats.length) {
        setActiveChatId('')
        setMessages([])
        return
      }

      if (!activeChatId) {
        setActiveChatId(nextChats[0].id)
        return
      }

      const stillExists = nextChats.some((chat) => chat.id === activeChatId)
      if (!stillExists) {
        setActiveChatId(nextChats[0].id)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được danh sách chat', 'Unable to load chat sessions'))
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (chatId: string) => {
    try {
      const { data } = await api.get(`/chat/sessions/${chatId}/messages?page=1&limit=200`)
      const nextMessages: ChatMessage[] = Array.isArray(data) ? data : []
      setMessages(nextMessages)
      const latest = nextMessages[nextMessages.length - 1]
      if (latest) {
        markChatSeen(chatId, latest.createdAt)
      } else {
        markChatSeen(chatId)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được tin nhắn', 'Unable to load messages'))
    }
  }

  useEffect(() => {
    loadChats()
  }, [statusFilter, effectiveBranchId])

  useEffect(() => {
    if (!activeChatId) return
    loadMessages(activeChatId)
  }, [activeChatId])

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, activeChatId])

  useEffect(() => {
    const socket = getSocket()

    const onConnect = () => {
      setSocketConnected(true)
      socket.emit('join-staff', {
        staffId: user?.id,
        staffName: user?.name,
        branchId: effectiveBranchId || undefined,
        role: user?.role || undefined,
      })
    }

    const onDisconnect = () => setSocketConnected(false)

    const onNewMessage = (payload: ChatMessage | { message?: ChatMessage }) => {
      const message = (payload as any)?.message ? (payload as any).message as ChatMessage : payload as ChatMessage
      setChats((prev) =>
        prev
          .map((chat) => {
            if (chat.id !== message.sessionId) return chat
            return {
              ...chat,
              updatedAt: message.createdAt,
              messages: [message],
            }
          })
          .sort(
            (a, b) =>
              new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
          ),
      )

      if (message.sessionId === activeChatIdRef.current) {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]))
        markChatSeen(message.sessionId, message.createdAt)
      } else if (message.senderType === 'CUSTOMER') {
        const relatedChat = chats.find((chat) => chat.id === message.sessionId)
        showRealtimeNotification(
          relatedChat ? tv(`Chat ${tableLabel(relatedChat.tableId)}`, `Chat ${tableLabel(relatedChat.tableId)}`) : tv('Chat mới từ khách', 'New customer chat'),
          message.content,
          'NEW_MESSAGE',
        )
      }
    }

    const onStaffNotification = (payload: StaffNotificationPayload) => {
      if (payload.type === 'CHAT_OPENED' || payload.type === 'CHAT_MESSAGE') {
        loadChats()
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('new-message', onNewMessage)
    socket.on('chat-closed', loadChats)
    socket.on('staff-notification', onStaffNotification)

    if (!socket.connected) {
      socket.connect()
    } else {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('new-message', onNewMessage)
      socket.off('chat-closed', loadChats)
      socket.off('staff-notification', onStaffNotification)
      if (staffTypingTimerRef.current) clearTimeout(staffTypingTimerRef.current)
      disconnectSocket()
    }
  }, [user?.id, user?.name, user?.role, effectiveBranchId])

  useEffect(() => {
    if (!activeChat?.id) return
    const socket = getSocket()
    socket.emit('join-chat-room', { sessionId: activeChat.id })
    api.post(`/chat/sessions/${activeChat.id}/mark-read`).catch(() => {})
  }, [activeChat?.id])

  const createChat = async () => {
    if (!newTableId.trim()) {
      toast.error(tv('Nhập tableId', 'Enter tableId'))
      return
    }
    try {
      const { data } = await api.post('/chats', { tableId: newTableId.trim(), branchId: effectiveBranchId || undefined })
      setNewTableId('')
      await loadChats()
      setActiveChatId(data.id)
      toast.success(tv('Tạo phiên chat thành công', 'Chat session created'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Tạo chat thất bại', 'Failed to create chat'))
    }
  }

  const sendMessage = async () => {
    if (!messageText.trim() || !activeChat) return
    setSending(true)
    try {
      const socket = getSocket()
      socket.emit('send-message', {
        sessionId: activeChat.id,
        content: messageText.trim(),
        senderType: 'STAFF',
        senderName: user?.name || 'Staff',
        senderId: user?.id,
      })
      setMessageText('')
      socket.emit('typing', {
        sessionId: activeChat.id,
        senderType: 'STAFF',
        senderName: user?.name || 'Staff',
        isTyping: false,
      })
      markChatSeen(activeChat.id)
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Gửi tin nhắn thất bại', 'Failed to send message'))
    } finally {
      setSending(false)
    }
  }

  const onTypingInput = (value: string) => {
    setMessageText(value)
    if (!activeChat?.id) return
    const socket = getSocket()
    if (!socket.connected) return
    socket.emit('typing', {
      sessionId: activeChat.id,
      senderType: 'STAFF',
      senderName: user?.name || 'Staff',
      isTyping: value.trim().length > 0,
    })
    if (staffTypingTimerRef.current) clearTimeout(staffTypingTimerRef.current)
    staffTypingTimerRef.current = setTimeout(() => {
      socket.emit('typing', {
        sessionId: activeChat.id,
        senderType: 'STAFF',
        senderName: user?.name || 'Staff',
        isTyping: false,
      })
    }, 1200)
  }

  const closeChat = async (chatId: string) => {
    try {
      await api.post(`/chat/sessions/${chatId}/close`)
      toast.success(tv('Đã đóng chat', 'Chat closed'))
      setMessages([])
      setActiveChatId('')
      setLastSeenMap((prev) => {
        const next = { ...prev }
        delete next[chatId]
        persistLastSeenMap(next)
        return next
      })
      await loadChats()
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Đóng chat thất bại', 'Failed to close chat'))
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{tv('Chat hỗ trợ', 'Support chat')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === 'OPEN' ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => setStatusFilter('OPEN')}
          >
            {tv('Đang mở', 'Open')}
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === 'ALL' ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => setStatusFilter('ALL')}
          >
            {tv('Tất cả', 'All')}
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {socketConnected ? tv('Realtime ON', 'Realtime ON') : tv('Realtime OFF', 'Realtime OFF')}
          </span>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newTableId}
            onChange={(e) => setNewTableId(e.target.value)}
            placeholder={tv('Tạo chat mới theo tableId...', 'Create chat by tableId...')}
            className="flex-1"
          />
          <Button className="w-full sm:w-auto" onClick={createChat}>{tv('Tạo chat', 'Create chat')}</Button>
        </div>
      </Card>

      {loading ? <ChatSkeleton /> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:min-h-[calc(100vh-260px)]">
        <Card className="max-h-[42vh] overflow-y-auto lg:col-span-1 lg:max-h-none">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">{tv('Phiên chat mở', 'Open chats')}</h3>
          <div className="space-y-2">
            {chats.map((chat) => {
              const latest = getLatestMessage(chat)
              const unread = hasUnread(chat)
              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id)
                    if (latest) {
                      markChatSeen(chat.id, latest.createdAt)
                    } else {
                      markChatSeen(chat.id)
                    }
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    activeChatId === chat.id
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-amber-100 bg-white/90 hover:bg-amber-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{tableLabel(chat.tableId)}</p>
                    {unread && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">{chat.unreadCount || tv('Mới', 'New')}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{chat.customerName || tv('Khách vãng lai', 'Walk-in customer')}</p>
                  <p className="mt-1 text-xs text-slate-500">{chat.status}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                    {latest ? formatSystemMessage(latest).preview : tv('Chưa có tin nhắn', 'No messages yet')}
                  </p>
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="flex min-h-[420px] flex-col lg:col-span-2">
          {!activeChat && <p className="text-sm text-slate-500">{tv('Chọn một chat để bắt đầu', 'Choose a chat to start')}</p>}
          {activeChat && (
            <>
              <div className="flex items-center justify-between border-b border-amber-100 pb-3 dark:border-gray-700">
                <p className="font-semibold text-slate-900 dark:text-white">{tableLabel(activeChat.tableId)}</p>
                <Button size="sm" variant="secondary" onClick={() => closeChat(activeChat.id)}>
                  {tv('Đóng chat', 'Close chat')}
                </Button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto py-4">
                {messages.map((msg) => {
                  const formatted = formatSystemMessage(msg)
                  const isOrderCard = msg.senderName === 'System' && formatted.type === 'ORDER_NEW'

                  if (isOrderCard) {
                    return (
                      <div
                        key={msg.id}
                        className="ml-auto max-w-[95%] rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-cyan-50 p-4 text-sm text-amber-950 shadow-sm sm:max-w-[90%]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                              {tv('Đơn mới', 'New order')}
                            </p>
                            <p className="mt-1 text-base font-bold text-slate-900">{formatted.tableText || tv('Bàn không xác định', 'Unknown table')}</p>
                          </div>
                          <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            {formatted.totalText || '0đ'}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {formatted.itemsText && (
                            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-amber-200">
                              {formatted.itemsText}
                            </span>
                          )}
                          {formatted.orderId && (
                            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-amber-200">
                              {tv('Mã đơn', 'Order')}: {maDonHangNgan(formatted.orderId)}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-700 ring-1 ring-amber-100">
                          <p className="whitespace-pre-line">{formatted.detail}</p>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`rounded-2xl p-3 text-sm ${
                        msg.senderType === 'STAFF'
                          ? 'ml-auto max-w-[90%] bg-amber-50 text-amber-950 sm:max-w-[85%]'
                          : 'max-w-[90%] bg-white/90 ring-1 ring-amber-100 sm:max-w-[85%]'
                      }`}
                    >
                      <p className="font-medium">
                        {msg.senderName === 'System' ? tv('Hệ thống', 'System') : msg.senderName} ({msg.senderType})
                      </p>
                      <p className="whitespace-pre-line">{formatted.detail}</p>
                    </div>
                  )
                })}
                <div ref={messageEndRef} />
              </div>

              <div className="mt-2 flex flex-col gap-2 border-t border-amber-100 pt-3 dark:border-gray-700 sm:flex-row">
                <Input
                  value={messageText}
                  onChange={(e) => onTypingInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={tv('Nhập tin nhắn...', 'Type a message...')}
                  className="flex-1"
                />
                <Button className="w-full sm:w-auto" onClick={sendMessage} loading={sending}>
                  {tv('Gửi', 'Send')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>}
    </div>
  )
}
