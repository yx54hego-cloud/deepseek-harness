import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { randomUUID } from 'expo-crypto'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { MobileClient, MobileRpcError, type ConnectionStatus } from './src/client'
import {
  parsePairingInput,
  projectActivity,
  projectTranscript,
  type ImageAttachmentLimits,
  type ImageMediaType,
  type LiveActivity,
  type ModelCatalogModel,
  type ModelProviderGroup,
  type ModelSelection,
  type PairingOffer,
  type SessionEvent,
  type SessionModels,
  type SessionSummary,
  type TranscriptMessage,
  type WorkspaceSummary,
} from './src/protocol'
import {
  clearActiveHostId,
  loadActiveHostId,
  loadPairedHosts,
  removePairedHost,
  saveActiveHostId,
  upsertPairedHost,
  type StoredPairedHost,
} from './src/storage'
import { themeFor, type Theme } from './src/theme'

const zh = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('zh')
const HISTORY_PAGE_MESSAGES = 6
const MOBILE_MAX_MESSAGE_IMAGE_BYTES = 5 * 1024 * 1024
const uiAssets = {
  addSquare: require('./assets/ui-reference/add-square.png') as ImageSourcePropType,
  assistantWhale: require('./assets/ui-reference/assistant-whale.png') as ImageSourcePropType,
  attachPlus: require('./assets/ui-reference/attach-plus.png') as ImageSourcePropType,
  brandLockup: require('./assets/ui-reference/brand-lockup.png') as ImageSourcePropType,
  chevronDown: require('./assets/ui-reference/chevron-down.png') as ImageSourcePropType,
  chevronRight: require('./assets/ui-reference/chevron-right.png') as ImageSourcePropType,
  compose: require('./assets/ui-reference/compose.png') as ImageSourcePropType,
  filter: require('./assets/ui-reference/filter.png') as ImageSourcePropType,
  folder: require('./assets/ui-reference/folder.png') as ImageSourcePropType,
  menu: require('./assets/ui-reference/menu.png') as ImageSourcePropType,
  message: require('./assets/ui-reference/message.png') as ImageSourcePropType,
  microphone: require('./assets/ui-reference/microphone.png') as ImageSourcePropType,
  modelChevron: require('./assets/ui-reference/model-chevron.png') as ImageSourcePropType,
  more: require('./assets/ui-reference/more.png') as ImageSourcePropType,
  newConversation: require('./assets/ui-reference/new-conversation.png') as ImageSourcePropType,
  search: require('./assets/ui-reference/search.png') as ImageSourcePropType,
  settings: require('./assets/ui-reference/settings.png') as ImageSourcePropType,
  voiceButton: require('./assets/ui-reference/voice-button.png') as ImageSourcePropType,
} as const

type UiAssetName = keyof typeof uiAssets

const iconMetrics: Record<Exclude<UiAssetName, 'brandLockup' | 'voiceButton'>, { width: number; height: number }> = {
  addSquare: { width: 18, height: 18 },
  assistantWhale: { width: 23, height: 18 },
  attachPlus: { width: 18, height: 18 },
  chevronDown: { width: 15, height: 10 },
  chevronRight: { width: 10, height: 15 },
  compose: { width: 19, height: 19 },
  filter: { width: 18, height: 18 },
  folder: { width: 20, height: 18 },
  menu: { width: 21, height: 14 },
  message: { width: 19, height: 19 },
  microphone: { width: 16, height: 20 },
  modelChevron: { width: 14, height: 9 },
  more: { width: 21, height: 7 },
  newConversation: { width: 19, height: 19 },
  search: { width: 18, height: 18 },
  settings: { width: 21, height: 22 },
}
const copy = zh
  ? {
    app: 'DeepSeek Harness',
    pairTitle: '连接你的电脑',
    pairBody: '在电脑上运行 dsh web，然后扫描终端中的二维码。',
    scan: '扫描配对二维码',
    paste: '或粘贴配对链接',
    connect: '连接',
    invalid: '这不是有效的 DeepSeek Harness 配对链接。',
    camera: '需要相机权限才能扫描二维码。',
    allowCamera: '允许相机',
    cancel: '取消',
    sessions: '会话',
    menu: '打开导航菜单',
    more: '更多操作',
    compose: '新建会话',
    search: '搜索',
    organize: '整理工作区',
    sortRecent: '按最近更新',
    sortName: '按名称排序',
    expandAll: '展开全部',
    collapseAll: '收起全部',
    workspaces: '工作区',
    recent: '最近',
    settings: '设置',
    settingsDevices: '设备管理',
    addDevice: '连接新电脑',
    removeDevice: '移除此设备',
    removeDeviceTitle: '移除设备？',
    removeDeviceBody: '移除后需要重新扫描电脑端二维码才能连接。',
    deviceSelected: '当前设备',
    noSavedDevices: '还没有保存的电脑。',
    settingsGeneral: '通用设置',
    settingsModels: '模型',
    settingsPlugins: '插件',
    settingsAgentPresets: 'Agent 预设',
    settingsPending: '此项设置将在后续版本完善。',
    model: 'V4 Pro',
    chooseModel: '选择模型',
    modelLoadError: '无法读取电脑端的模型列表。',
    modelSelectError: '模型没有切换成功，请重试。',
    modelUnavailable: '当前会话的模型提供方不可用，请选择其他模型。',
    noModels: '电脑端没有可用模型。',
    attach: '添加附件',
    chooseAttachment: '选择操作',
    image: '图片',
    workspace: '工作区',
    chooseWorkspace: '选择新会话工作区',
    workspaceMoveError: '工作区切换失败，请重试。',
    noWorkspaces: '电脑端还没有可用工作区。',
    removeImage: '移除图片',
    imageUnavailable: '当前会话没有启用图片附件。',
    imageUnsupported: '只支持 PNG、JPEG、WebP 和 GIF 图片。',
    imageTooLarge: '所选图片超过当前允许的大小。',
    imageTooMany: '所选图片超过当前允许的数量。',
    imageReadError: '无法读取所选图片。',
    microphone: '语音输入',
    selectSession: '请从左侧菜单选择一段会话',
    noSessions: '还没有可显示的会话',
    noSessionsBody: '先在电脑的 DeepSeek Harness 网页中开始一次对话。',
    scanAccepted: '二维码已识别',
    scanAcceptedBody: '正在保存配对并连接电脑…',
    connected: '已连接',
    connecting: '连接中',
    offline: '等待电脑',
    error: '连接失败',
    connectingBody: '正在连接配对的电脑…',
    connectionFailedTitle: '无法连接电脑',
    connectionFailedBody: '请确认电脑端仍在运行，并且手机与电脑连接到同一个 Wi-Fi。',
    retry: '重试',
    forget: '忘记电脑',
    untitled: '未命名会话',
    running: '正在运行',
    emptyChat: '这段会话还没有文字消息。',
    loadOlder: '加载更早记录',
    loadingOlder: '正在加载…',
    placeholder: '给智能体发消息',
    send: '发送',
    loadError: '无法读取会话',
    sendError: '指令没有发送，请检查连接后重试。',
    newSessionError: '新会话创建失败，请检查电脑端连接。',
    noSearchResults: '没有匹配的工作区或会话。',
    back: '返回会话列表',
    security: '配对令牌只会在端到端加密建立后发送。手机端只能读取会话、切换模型并发送文字或图片。',
  }
  : {
    app: 'DeepSeek Harness',
    pairTitle: 'Connect your computer',
    pairBody: 'Run dsh web on your computer, then scan the QR code printed in the terminal.',
    scan: 'Scan pairing QR',
    paste: 'Or paste a pairing link',
    connect: 'Connect',
    invalid: 'This is not a valid DeepSeek Harness pairing link.',
    camera: 'Camera access is needed to scan the pairing QR.',
    allowCamera: 'Allow camera',
    cancel: 'Cancel',
    sessions: 'Sessions',
    menu: 'Open navigation menu',
    more: 'More actions',
    compose: 'New conversation',
    search: 'Search',
    organize: 'Organize workspaces',
    sortRecent: 'Sort by recent activity',
    sortName: 'Sort by name',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    workspaces: 'Workspaces',
    recent: 'Recent',
    settings: 'Settings',
    settingsDevices: 'Devices',
    addDevice: 'Connect another computer',
    removeDevice: 'Remove this computer',
    removeDeviceTitle: 'Remove computer?',
    removeDeviceBody: 'You will need to scan the computer QR code again to reconnect.',
    deviceSelected: 'Current device',
    noSavedDevices: 'No saved computers yet.',
    settingsGeneral: 'General settings',
    settingsModels: 'Models',
    settingsPlugins: 'Plugins',
    settingsAgentPresets: 'Agent presets',
    settingsPending: 'This setting will be completed in a later version.',
    model: 'V4 Pro',
    chooseModel: 'Choose model',
    modelLoadError: 'Could not load the model list from the computer.',
    modelSelectError: 'The model was not changed. Try again.',
    modelUnavailable: 'The current model provider is unavailable. Choose another model.',
    noModels: 'No models are available on the computer.',
    attach: 'Add attachment',
    chooseAttachment: 'Choose action',
    image: 'Image',
    workspace: 'Workspace',
    chooseWorkspace: 'Choose workspace for the new conversation',
    workspaceMoveError: 'Could not change the workspace. Try again.',
    noWorkspaces: 'No workspaces are available on the computer.',
    removeImage: 'Remove image',
    imageUnavailable: 'Image attachments are not enabled for this session.',
    imageUnsupported: 'Only PNG, JPEG, WebP, and GIF images are supported.',
    imageTooLarge: 'The selected images exceed the current size limit.',
    imageTooMany: 'The selected images exceed the current count limit.',
    imageReadError: 'Could not read the selected image.',
    microphone: 'Voice input',
    selectSession: 'Choose a conversation from the navigation menu',
    noSessions: 'No sessions yet',
    noSessionsBody: 'Start a conversation in the DeepSeek Harness browser app first.',
    scanAccepted: 'QR code recognized',
    scanAcceptedBody: 'Saving the pairing and connecting to your computer…',
    connected: 'Connected',
    connecting: 'Connecting',
    offline: 'Waiting for computer',
    error: 'Connection failed',
    connectingBody: 'Connecting to the paired computer…',
    connectionFailedTitle: 'Could not connect',
    connectionFailedBody: 'Make sure the computer is still running and both devices are on the same Wi-Fi network.',
    retry: 'Retry',
    forget: 'Forget computer',
    untitled: 'Untitled session',
    running: 'Running',
    emptyChat: 'This session has no text messages yet.',
    loadOlder: 'Load earlier messages',
    loadingOlder: 'Loading…',
    placeholder: 'Message the agent',
    send: 'Send',
    loadError: 'Could not load sessions',
    sendError: 'The instruction was not sent. Check the connection and try again.',
    newSessionError: 'Could not create a new session. Check the computer connection.',
    noSearchResults: 'No workspace or session matches this search.',
    back: 'Back to sessions',
    security: 'The pairing token is sent only after end-to-end encryption is established. Mobile access is limited to conversations, model selection, text, and images.',
  }

interface HistoryValue {
  events: { event: SessionEvent; view?: unknown }[]
  hasMore: boolean
  projections?: { values: { imageLimits?: ImageAttachmentLimits } }
}

interface DraftImage {
  id: string
  uri: string
  name: string
  mediaType: ImageMediaType
  size: number
}

/** Root provider for safe areas and appearance. */
export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <MobileApp />
    </SafeAreaProvider>
  )
}

/** Paired-host lifecycle and the three compact application screens. */
function MobileApp(): React.JSX.Element {
  const dark = useColorScheme() === 'dark'
  const theme = useMemo(() => themeFor(dark), [dark])
  const styles = useMemo(() => createStyles(theme), [theme])
  const [loadingHost, setLoadingHost] = useState(true)
  const [hosts, setHosts] = useState<StoredPairedHost[]>([])
  const [activeHostId, setActiveHostId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [deviceManagerOpen, setDeviceManagerOpen] = useState(false)

  useEffect(() => {
    void Promise.all([loadPairedHosts(), loadActiveHostId()]).then(([saved, selected]) => {
      const active = saved.some(host => host.id === selected) ? selected : saved[0]?.id ?? null
      setHosts(saved)
      setActiveHostId(active)
      if (active !== null) void saveActiveHostId(active)
    }).catch(() => {
      setHosts([])
      setActiveHostId(null)
    }).finally(() => setLoadingHost(false))
  }, [])

  const pair = useCallback(async (input: string) => {
    const parsed = parsePairingInput(input)
    if (parsed === null) {
      Alert.alert(copy.app, copy.invalid)
      return false
    }
    const next = await upsertPairedHost(parsed)
    setHosts(next)
    setActiveHostId(parsed.deviceId)
    await saveActiveHostId(parsed.deviceId)
    setScanning(false)
    setDeviceManagerOpen(false)
    return true
  }, [])

  const selectHost = useCallback((id: string) => {
    if (!hosts.some(host => host.id === id)) return
    setActiveHostId(id)
    void saveActiveHostId(id)
    setDeviceManagerOpen(false)
  }, [hosts])

  const forgetHost = useCallback(async (id: string) => {
    const next = await removePairedHost(id)
    setHosts(next)
    if (activeHostId !== id) return
    const replacement = next[0]?.id ?? null
    setActiveHostId(replacement)
    if (replacement === null) await clearActiveHostId()
    else await saveActiveHostId(replacement)
  }, [activeHostId])

  useEffect(() => {
    const acceptLink = ({ url }: { url: string }) => { void pair(url) }
    const subscription = Linking.addEventListener('url', acceptLink)
    void Linking.getInitialURL().then((url) => { if (url !== null) void pair(url) })
    return () => subscription.remove()
  }, [pair])

  if (loadingHost) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <ActivityIndicator color={theme.blue} size="small" />
      </SafeAreaView>
    )
  }
  const activeHost = hosts.find(host => host.id === activeHostId) ?? null
  const mainScreen = activeHost === null
    ? <PairScreen theme={theme} styles={styles} onScan={() => setScanning(true)} onPair={pair} />
    : (
      <SessionApp
        key={activeHost.id}
        offer={activeHost.offer}
        theme={theme}
        styles={styles}
        onForget={() => forgetHost(activeHost.id)}
        onOpenDevices={() => setDeviceManagerOpen(true)}
      />
    )
  return <>
    {mainScreen}
    {activeHost !== null && <DeviceManager
      activeHostId={activeHost.id}
      hosts={hosts}
      onClose={() => setDeviceManagerOpen(false)}
      onForget={forgetHost}
      onPair={() => { setDeviceManagerOpen(false); setScanning(true) }}
      onSelect={selectHost}
      styles={styles}
      theme={theme}
      visible={deviceManagerOpen}
    />}
    {scanning && <Scanner theme={theme} styles={styles} onCancel={() => setScanning(false)} onPair={pair} />}
  </>
}

interface SharedScreenProps {
  theme: Theme
  styles: ReturnType<typeof createStyles>
}

/** First-run scan and paste intake. */
function PairScreen({ theme, styles, onScan, onPair }: SharedScreenProps & {
  onScan: () => void
  onPair: (input: string) => Promise<boolean>
}): React.JSX.Element {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={theme.background === '#151517' ? 'light' : 'dark'} />
      <View style={styles.pairingContent}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>DS</Text></View>
        <Text accessibilityRole="header" style={styles.pairTitle}>{copy.pairTitle}</Text>
        <Text style={styles.pairBody}>{copy.pairBody}</Text>
        <Pressable accessibilityRole="button" onPress={onScan} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{copy.scan}</Text>
        </Pressable>
        <Text style={styles.fieldLabel}>{copy.paste}</Text>
        <TextInput
          accessibilityLabel={copy.paste}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={setInput}
          placeholder="dsh://pair?code=…"
          placeholderTextColor={theme.tertiary}
          style={styles.pairInput}
          value={input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={input.trim().length === 0 || saving}
          onPress={() => {
            setSaving(true)
            void onPair(input).finally(() => setSaving(false))
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
            (input.trim().length === 0 || saving) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {saving ? <ActivityIndicator color={theme.text} /> : <Text style={styles.secondaryButtonText}>{copy.connect}</Text>}
        </Pressable>
        <Text style={styles.securityText}>{copy.security}</Text>
      </View>
    </SafeAreaView>
  )
}

/** Native QR scanner with an inline permission recovery state. */
function Scanner({ theme, styles, onCancel, onPair }: SharedScreenProps & {
  onCancel: () => void
  onPair: (input: string) => Promise<boolean>
}): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions()
  const [consumed, setConsumed] = useState(false)
  const [closing, setClosing] = useState(false)
  const exit = useCallback(() => {
    if (closing) return
    setClosing(true)
    // Unmount the native preview before replacing the camera screen. SurfaceView
    // can otherwise leave a black rectangle over the next conversation layout.
    setTimeout(onCancel, 180)
  }, [closing, onCancel])
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { exit(); return true })
    return () => subscription.remove()
  }, [exit])
  if (permission === null) return <SafeAreaView style={styles.center}><ActivityIndicator color={theme.blue} /></SafeAreaView>
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionText}>{copy.camera}</Text>
        <Pressable accessibilityRole="button" onPress={() => { void requestPermission() }} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{copy.allowCamera}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={exit} style={styles.textButton}>
          <Text style={styles.textButtonText}>{copy.cancel}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }
  if (consumed) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style={theme.background === '#151517' ? 'light' : 'dark'} />
        <ActivityIndicator color={theme.blue} />
        <Text accessibilityRole="header" style={styles.emptyTitle}>{copy.scanAccepted}</Text>
        <Text style={styles.emptyBody}>{copy.scanAcceptedBody}</Text>
      </SafeAreaView>
    )
  }
  return (
    <Modal animationType="none" onRequestClose={exit} statusBarTranslucent visible>
      <View style={styles.cameraScreen}>
        <StatusBar style={closing ? (theme.background === '#151517' ? 'light' : 'dark') : 'light'} />
        {!closing && <CameraView
          active
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={consumed ? undefined : ({ data }) => {
            setConsumed(true)
            setClosing(true)
            void onPair(data).then((ok) => {
              if (!ok) {
                setConsumed(false)
                setClosing(false)
              }
            })
          }}
          style={StyleSheet.absoluteFill}
        />}
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.scanFrame} />
          <Pressable accessibilityRole="button" onPress={exit} style={styles.cameraCancel}>
            <Text style={styles.cameraCancelText}>{copy.cancel}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

/** Connected session list and conversation detail. */
function SessionApp({ offer, theme, styles, onForget, onOpenDevices }: SharedScreenProps & {
  offer: PairingOffer
  onForget: () => Promise<void>
  onOpenDevices: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [workspaceViews, setWorkspaceViews] = useState<WorkspaceSummary[]>([])
  const [archivedSessionIds, setArchivedSessionIds] = useState<readonly string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [liveEvents, setLiveEvents] = useState<SessionEvent[]>([])
  const liveSeqRef = useRef(1_000_000_000_000)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [imageLimits, setImageLimits] = useState<ImageAttachmentLimits | null>(null)
  const [sending, setSending] = useState(false)
  const [models, setModels] = useState<SessionModels | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelSelecting, setModelSelecting] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [movingWorkspace, setMovingWorkspace] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const knownSessionIds = useRef(new Set<string>())
  const lastAddedSession = useRef<{ sessionId: string; cwd?: string; at: number } | null>(null)
  const client = useMemo(() => new MobileClient(offer), [offer])
  const messages = useMemo(() => projectTranscript(events), [events])
  const activities = useMemo(() => projectActivity([...events, ...liveEvents]), [events, liveEvents])
  const [imageSources, setImageSources] = useState<Record<string, string>>({})
  const fetchedImages = useRef(new Set<string>())
  const visibleSessions = useMemo(() => {
    const archived = new Set(archivedSessionIds)
    return sessions.filter(session => !archived.has(session.sessionId))
  }, [archivedSessionIds, sessions])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const closeSession = useCallback(() => {
    selectedIdRef.current = null
    setSelectedId(null)
    setEvents([])
    setLiveEvents([])
    setHistoryHasMore(false)
    setLoadingOlder(false)
    setImageLimits(null)
    setDraftImages([])
    setModels(null)
    setImageSources({})
    fetchedImages.current.clear()
    setModelPickerOpen(false)
  }, [])

  const loadAttachment = useCallback(async (sessionId: string, attachmentId: string, mediaType: string) => {
    if (fetchedImages.current.has(attachmentId)) return
    fetchedImages.current.add(attachmentId)
    try {
      const value = await client.request<{ attachment: { mediaType: string }; data: string }>('session.attachment', {
        sessionId,
        attachmentId,
      })
      if (selectedIdRef.current === sessionId) {
        const type = value.attachment.mediaType || mediaType
        setImageSources(previous => ({ ...previous, [attachmentId]: `data:${type};base64,${value.data}` }))
      }
    } catch {
      fetchedImages.current.delete(attachmentId)
    }
  }, [client])

  useEffect(() => {
    const sessionId = selectedId
    if (sessionId === null) return
    for (const image of messages.flatMap(message => message.images ?? [])) {
      void loadAttachment(sessionId, image.attachmentId, image.mediaType)
    }
  }, [loadAttachment, messages, selectedId])

  const loadModels = useCallback(async (sessionId: string) => {
    setModelsLoading(true)
    try {
      const value = await client.request<SessionModels>('session.models', { sessionId })
      if (selectedIdRef.current === sessionId) setModels(value)
      return value
    } catch {
      if (selectedIdRef.current === sessionId) setError(copy.modelLoadError)
      return null
    } finally {
      if (selectedIdRef.current === sessionId) setModelsLoading(false)
    }
  }, [client])

  const refreshSessions = useCallback(async () => {
    try {
      const [sessionValue, workspaceValue] = await Promise.all([
        client.request<{ items: SessionSummary[] }>('session.list', {}),
        client.request<{ items: WorkspaceSummary[]; archivedSessionIds: string[] }>('workspace.list', {}),
      ])
      const currentSessionId = selectedIdRef.current
      const listed = sessionValue.items.filter(session =>
        (!session.blank || session.sessionId === currentSessionId || knownSessionIds.current.has(session.sessionId))
        && session.origin === undefined,
      )
      setSessions((previous) => {
        const listedIds = new Set(listed.map(session => session.sessionId))
        const retainedBlank = previous.filter(session =>
          session.blank
          && !listedIds.has(session.sessionId)
          && (session.sessionId === currentSessionId || knownSessionIds.current.has(session.sessionId)),
        )
        return [...retainedBlank, ...listed]
      })
      setWorkspaceViews(workspaceValue.items)
      setArchivedSessionIds(workspaceValue.archivedSessionIds)
      if (selectedIdRef.current !== null && workspaceValue.archivedSessionIds.includes(selectedIdRef.current)) closeSession()
      setError(null)
    } catch {
      setError(copy.loadError)
    }
  }, [client, closeSession])

  const openSession = useCallback(async (sessionId: string) => {
    const changed = selectedIdRef.current !== sessionId
    selectedIdRef.current = sessionId
    setSelectedId(sessionId)
    setEvents([])
    setLiveEvents([])
    setHistoryHasMore(false)
    setLoadingOlder(false)
    setLoadingHistory(true)
    setError(null)
    setImageLimits(null)
    setModels(null)
    setModelPickerOpen(false)
    if (changed) {
      setDraftImages([])
      setImageSources({})
      fetchedImages.current.clear()
    }
    void loadModels(sessionId)
    try {
      const value = await client.request<HistoryValue>('session.history', { sessionId, maxMessages: HISTORY_PAGE_MESSAGES })
      if (selectedIdRef.current !== sessionId) return
      const loaded = value.events.map(entry => entry.view === undefined ? entry.event : { ...entry.event, view: entry.view })
      setEvents((previous) => {
        const known = new Set(loaded.map(event => event.seq))
        return [...loaded, ...previous.filter(event => !known.has(event.seq))].sort((a, b) => a.seq - b.seq)
      })
      setHistoryHasMore(value.hasMore)
      setImageLimits(value.projections?.values.imageLimits ?? null)
    } catch {
      if (selectedIdRef.current === sessionId) setError(copy.loadError)
    } finally {
      if (selectedIdRef.current === sessionId) setLoadingHistory(false)
    }
  }, [client, loadModels])

  const loadOlder = useCallback(async () => {
    const sessionId = selectedIdRef.current
    const beforeSeq = events.reduce((earliest, event) => Math.min(earliest, event.seq), Number.POSITIVE_INFINITY)
    if (sessionId === null || !historyHasMore || loadingOlder || !Number.isFinite(beforeSeq)) return
    setLoadingOlder(true)
    setError(null)
    try {
      const value = await client.request<HistoryValue>('session.history', {
        sessionId,
        beforeSeq,
        maxMessages: HISTORY_PAGE_MESSAGES,
      })
      if (selectedIdRef.current !== sessionId) return
      const older = value.events.map(entry => entry.view === undefined ? entry.event : { ...entry.event, view: entry.view })
      setEvents((previous) => {
        const known = new Set(previous.map(event => event.seq))
        return [...older.filter(event => !known.has(event.seq)), ...previous].sort((a, b) => a.seq - b.seq)
      })
      setHistoryHasMore(value.hasMore)
    } catch {
      if (selectedIdRef.current === sessionId) setError(copy.loadError)
    } finally {
      if (selectedIdRef.current === sessionId) setLoadingOlder(false)
    }
  }, [client, events, historyHasMore, loadingOlder])

  useEffect(() => {
    const first = visibleSessions[0]
    if (status !== 'connected' || selectedIdRef.current !== null || first === undefined) return
    void openSession(first.sessionId)
  }, [openSession, status, visibleSessions])

  useEffect(() => {
    const stopStatus = client.onStatus((next) => {
      setStatus(next)
      if (next === 'connected') setConnectionFailed(false)
      else if (next === 'offline' || next === 'error') setConnectionFailed(true)
      if (next === 'connected') {
        void refreshSessions()
        const current = selectedIdRef.current
        if (current !== null) void openSession(current)
      }
    })
    const stopEvents = client.onEvent((request) => {
      const payload = request.payload as {
        type?: string
        sessionId?: string
        event?: SessionEvent
        view?: unknown
        key?: string
        value?: unknown
        running?: boolean
        blank?: boolean
        cwd?: unknown
        origin?: unknown
        archivedSessionIds?: unknown
      }
      if (payload.type === 'session/event' && payload.sessionId === selectedIdRef.current && payload.event !== undefined) {
        const event = payload.view === undefined ? payload.event : { ...payload.event, view: payload.view }
        setEvents(previous => previous.some(item => item.seq === event.seq)
          ? previous
          : [...previous, event as SessionEvent])
        if (event.type === 'user/message') {
          setSessions(previous => previous.map(session => session.sessionId === payload.sessionId
            ? { ...session, blank: false, updatedAt: Date.now() }
            : session))
        }
      } else if (payload.sessionId === selectedIdRef.current && (payload.type === 'approval/requested' || payload.type === 'approval/resolved' || payload.type === 'question/requested' || payload.type === 'question/resolved')) {
        const eventType = payload.type === 'approval/requested'
          ? 'approval/asked'
          : payload.type === 'approval/resolved'
            ? 'approval/decided'
            : payload.type
        const event: SessionEvent = {
          type: eventType,
          seq: liveSeqRef.current++,
          time: Date.now(),
          data: payload,
        }
        setLiveEvents(previous => [...previous, event])
      } else if (payload.type === 'session/projection' && payload.key === 'title' && typeof payload.sessionId === 'string') {
        setSessions(previous => previous.map(session => session.sessionId === payload.sessionId
          ? { ...session, projections: { asOfSeq: Number.MAX_SAFE_INTEGER, values: { title: typeof payload.value === 'string' ? payload.value : null } } }
          : session))
      } else if (payload.type === 'host/session-status' && typeof payload.sessionId === 'string') {
        setSessions(previous => previous.map(session => session.sessionId === payload.sessionId
          ? { ...session, running: payload.running === true }
          : session))
      } else if (payload.type === 'host/session-added' && typeof payload.sessionId === 'string') {
        if (payload.origin === 'subagent') return
        knownSessionIds.current.add(payload.sessionId)
        lastAddedSession.current = {
          sessionId: payload.sessionId,
          ...(typeof payload.cwd === 'string' ? { cwd: payload.cwd } : {}),
          at: Date.now(),
        }
        const summary: SessionSummary = {
          sessionId: payload.sessionId,
          updatedAt: Date.now(),
          running: payload.running === true,
          blank: payload.blank === true,
          ...(typeof payload.cwd === 'string' ? { cwd: payload.cwd } : {}),
        }
        setSessions((previous) => {
          const existing = previous.find(session => session.sessionId === payload.sessionId)
          if (existing === undefined) return [summary, ...previous]
          return previous.map(session => session.sessionId === payload.sessionId ? { ...session, ...summary } : session)
        })
        void refreshSessions()
      } else if (payload.type === 'host/session-removed' && typeof payload.sessionId === 'string') {
        knownSessionIds.current.delete(payload.sessionId)
        setSessions(previous => previous.filter(session => session.sessionId !== payload.sessionId))
        if (selectedIdRef.current === payload.sessionId) closeSession()
      } else if (payload.type === 'host/archived-sessions-changed' && Array.isArray(payload.archivedSessionIds)) {
        const archived = payload.archivedSessionIds.filter((value): value is string => typeof value === 'string')
        setArchivedSessionIds(archived)
        if (selectedIdRef.current !== null && archived.includes(selectedIdRef.current)) closeSession()
      }
    })
    client.start()
    return () => { stopStatus(); stopEvents(); client.stop() }
  }, [client, closeSession, openSession, refreshSessions])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!drawerOpen) return false
      setDrawerOpen(false)
      return true
    })
    return () => subscription.remove()
  }, [drawerOpen])

  const forget = (): void => {
    Alert.alert(copy.forget, copy.security, [
      { text: copy.cancel, style: 'cancel' },
      { text: copy.forget, style: 'destructive', onPress: () => { client.stop(); void onForget() } },
    ])
  }

  const pickImages = useCallback(async () => {
    if (imageLimits === null) {
      Alert.alert(copy.app, copy.imageUnavailable)
      return
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...imageLimits.mediaTypes],
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const selectedImages: DraftImage[] = []
      for (const asset of result.assets) {
        const mediaType = imageMediaType(asset.mimeType, asset.name)
        if (mediaType === null || !imageLimits.mediaTypes.includes(mediaType)) {
          Alert.alert(copy.app, copy.imageUnsupported)
          return
        }
        const size = asset.size ?? new File(asset.uri).size ?? 0
        selectedImages.push({ id: randomUUID(), uri: asset.uri, name: asset.name, mediaType, size })
      }
      if (draftImages.length + selectedImages.length > imageLimits.maxImagesPerMessage) {
        Alert.alert(copy.app, copy.imageTooMany)
        return
      }
      const maxTotal = Math.min(imageLimits.maxMessageImageBytes, MOBILE_MAX_MESSAGE_IMAGE_BYTES)
      const total = [...draftImages, ...selectedImages].reduce((sum, image) => sum + image.size, 0)
      if (selectedImages.some(image => image.size > imageLimits.maxImageBytes) || total > maxTotal) {
        Alert.alert(copy.app, copy.imageTooLarge)
        return
      }
      setDraftImages(previous => [...previous, ...selectedImages])
    } catch {
      Alert.alert(copy.app, copy.imageReadError)
    }
  }, [draftImages, imageLimits])

  const selectModel = useCallback(async (group: ModelProviderGroup, model: ModelCatalogModel) => {
    const sessionId = selectedIdRef.current
    if (sessionId === null || modelSelecting) return
    const selection: ModelSelection = {
      provider: group.id,
      model: model.id,
      ...model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort },
    }
    setModelSelecting(true)
    setError(null)
    try {
      const value = await client.request<{ selected: ModelSelection }>('session.selectModel', { sessionId, ...selection })
      if (selectedIdRef.current !== sessionId) return
      setModels(previous => previous === null ? previous : { ...previous, current: value.selected, routable: true })
      setModelPickerOpen(false)
    } catch (error: unknown) {
      if (selectedIdRef.current === sessionId) setError(formatRpcError(copy.modelSelectError, error))
    } finally {
      if (selectedIdRef.current === sessionId) setModelSelecting(false)
    }
  }, [client, modelSelecting])

  const createSession = useCallback(async (workspaceId?: string) => {
    if (creatingSession || status !== 'connected') return
    setCreatingSession(true)
    setError(null)
    const startedAt = Date.now()
    const requestedSessionId = randomUUID()
    const currentSessionId = selectedIdRef.current
    const currentWorkspace = sessions.find(session => session.sessionId === currentSessionId)?.cwd
      ?? visibleSessions[0]?.cwd
    const selectedWorkspace = workspaceId === undefined
      ? workspaceViews.find(workspace => currentSessionId !== null && workspace.sessionIds.includes(currentSessionId))
        ?? workspaceViews.find(workspace => currentWorkspace !== undefined && sameWorkspacePath(workspace.path, currentWorkspace))
      : workspaceViews.find(workspace => workspace.workspaceId === workspaceId)
    if (workspaceId !== undefined && selectedWorkspace === undefined) {
      setError(copy.workspaceMoveError)
      setCreatingSession(false)
      return
    }
    const targetWorkspacePath = selectedWorkspace?.path ?? currentWorkspace
    try {
      const value = await client.request<{ sessionId: string }>('session.create', {
        sessionId: requestedSessionId,
        ...(selectedWorkspace === undefined
          ? currentWorkspace === undefined ? {} : { cwd: currentWorkspace }
          : { workspaceId: selectedWorkspace.workspaceId }),
      })
      lastAddedSession.current = null
      const summary: SessionSummary = {
        sessionId: value.sessionId,
        updatedAt: Date.now(),
        running: false,
        blank: true,
        ...(targetWorkspacePath === undefined ? {} : { cwd: targetWorkspacePath }),
      }
      knownSessionIds.current.add(value.sessionId)
      setSessions(previous => previous.some(session => session.sessionId === value.sessionId)
        ? previous
        : [summary, ...previous])
      setDrawerOpen(false)
      await openSession(value.sessionId)
      void refreshSessions()
    } catch (error: unknown) {
      const added = lastAddedSession.current
      const sameWorkspace = targetWorkspacePath === undefined
        || added?.cwd === undefined
        || sameWorkspacePath(added.cwd, targetWorkspacePath)
      if (added !== null && added.sessionId === requestedSessionId && added.at >= startedAt && sameWorkspace) {
        const summary: SessionSummary = {
          sessionId: added.sessionId,
          updatedAt: added.at,
          running: false,
          blank: true,
          ...(added.cwd === undefined ? {} : { cwd: added.cwd }),
        }
        knownSessionIds.current.add(added.sessionId)
        lastAddedSession.current = null
        setSessions(previous => previous.some(session => session.sessionId === added.sessionId)
          ? previous
          : [summary, ...previous])
        setDrawerOpen(false)
        await openSession(added.sessionId)
        void refreshSessions()
        return
      }
      setError(formatRpcError(copy.newSessionError, error))
    } finally {
      setCreatingSession(false)
    }
  }, [client, creatingSession, openSession, refreshSessions, sessions, status, visibleSessions, workspaceViews])

  const createSessionInWorkspace = useCallback(async (workspaceId: string) => {
    if (movingWorkspace || creatingSession) return
    if (status !== 'connected') {
      setError(copy.connectionFailedBody)
      return
    }
    setMovingWorkspace(true)
    try {
      await createSession(workspaceId)
      setWorkspacePickerOpen(false)
      setAttachmentMenuOpen(false)
    } finally {
      setMovingWorkspace(false)
    }
  }, [createSession, creatingSession, movingWorkspace, status])

  const openWorkspacePicker = useCallback(() => {
    if (status !== 'connected') {
      setError(copy.connectionFailedBody)
      return
    }
    setDrawerOpen(false)
    setAttachmentMenuOpen(false)
    setWorkspacePickerOpen(true)
  }, [status])

  const selected = sessions.find(session => session.sessionId === selectedId) ?? null
  const modelLabel = selectedModelName(models)
  const emptyBody = connectionFailed
    ? copy.connectionFailedBody
    : status === 'connected' && visibleSessions.length === 0
      ? copy.noSessionsBody
      : status === 'connected'
        ? copy.selectSession
        : copy.connectingBody
  return (
    <View style={styles.appShell}>
      <ConversationScreen
        key={selectedId ?? 'no-session'}
        draft={draft}
        draftImages={draftImages}
        emptyBody={emptyBody}
        error={error}
        hasMore={selectedId !== null && historyHasMore}
        loading={selectedId !== null && loadingHistory}
        loadingOlder={loadingOlder}
        messages={selectedId === null ? [] : messages}
        activities={selectedId === null ? [] : activities}
        modelLabel={modelLabel}
        modelLoading={modelSelecting}
        imageSources={imageSources}
        onAttach={() => setAttachmentMenuOpen(true)}
        onCompose={openWorkspacePicker}
        onDraft={setDraft}
        onLoadOlder={loadOlder}
        onMenu={() => setDrawerOpen(true)}
        onMore={forget}
        onOpenModels={() => {
          const sessionId = selectedIdRef.current
          if (sessionId === null) return
          setModelPickerOpen(true)
          void loadModels(sessionId)
        }}
        onRemoveImage={id => setDraftImages(previous => previous.filter(image => image.id !== id))}
        onSend={async () => {
          const sessionId = selectedIdRef.current
          const text = draft.trim()
          if (sessionId === null || (text.length === 0 && draftImages.length === 0)) return
          setSending(true)
          setError(null)
          try {
            const images = await Promise.all(draftImages.map(async image => ({
              type: 'image' as const,
              mediaType: image.mediaType,
              data: await readImageBase64(image.uri),
              name: image.name,
            })))
            const maxTotal = Math.min(imageLimits?.maxMessageImageBytes ?? MOBILE_MAX_MESSAGE_IMAGE_BYTES, MOBILE_MAX_MESSAGE_IMAGE_BYTES)
            const imageBytes = images.map(image => base64ByteLength(image.data))
            if (imageLimits !== null && (imageBytes.some(size => size > imageLimits.maxImageBytes)
              || imageBytes.reduce((sum, size) => sum + size, 0) > maxTotal)) throw new Error(copy.imageTooLarge)
            await client.request('session.prompt', {
              sessionId,
              mode: 'queue',
              content: [...text.length === 0 ? [] : [{ type: 'text' as const, text }], ...images],
              clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })
            setSessions(previous => previous.map(session => session.sessionId === sessionId
              ? { ...session, blank: false, updatedAt: Date.now() }
              : session))
            setDraft('')
            setDraftImages([])
          } catch (error: unknown) {
            setError(error instanceof Error && error.message === copy.imageTooLarge
              ? copy.imageTooLarge
              : formatRpcError(copy.sendError, error))
          } finally {
            setSending(false)
          }
        }}
        selected={selected !== null}
        sending={sending}
        status={status}
        styles={styles}
        theme={theme}
      />
      <AttachmentMenu
        onClose={() => setAttachmentMenuOpen(false)}
        onImage={() => {
          setAttachmentMenuOpen(false)
          void pickImages()
        }}
        onWorkspace={() => {
          openWorkspacePicker()
        }}
        styles={styles}
        theme={theme}
        visible={attachmentMenuOpen}
      />
      <WorkspacePicker
        currentSessionId={selectedId}
        loading={movingWorkspace}
        onClose={() => setWorkspacePickerOpen(false)}
        onSelect={(workspaceId) => { void createSessionInWorkspace(workspaceId) }}
        styles={styles}
        theme={theme}
        views={workspaceViews}
        visible={workspacePickerOpen}
      />
      <ModelPicker
        loading={modelSelecting}
        models={models}
        refreshing={modelsLoading}
        onClose={() => setModelPickerOpen(false)}
        onRetry={() => {
          const sessionId = selectedIdRef.current
          if (sessionId !== null) void loadModels(sessionId)
        }}
        onSelect={(group, model) => { void selectModel(group, model) }}
        styles={styles}
        theme={theme}
        visible={modelPickerOpen}
      />
      <SessionDrawer
        currentSessionId={selectedId}
        creating={creatingSession}
        onClose={() => setDrawerOpen(false)}
        onForget={forget}
        onOpenSession={(sessionId) => {
          setDrawerOpen(false)
          void openSession(sessionId)
        }}
        onNewSession={openWorkspacePicker}
        onOpenSettings={() => {
          setDrawerOpen(false)
          setSettingsOpen(true)
        }}
        onRefresh={() => {
          setRefreshing(true)
          void refreshSessions().finally(() => setRefreshing(false))
        }}
        refreshing={refreshing}
        sessions={visibleSessions}
        status={status}
        styles={styles}
        theme={theme}
        visible={drawerOpen}
      />
      <SettingsPanel
        onClose={() => setSettingsOpen(false)}
        onOpenDevices={onOpenDevices}
        styles={styles}
        theme={theme}
        visible={settingsOpen}
      />
    </View>
  )
}

/** Persistent conversation surface beneath the navigation drawer. */
function ConversationScreen({
  activities, draft, draftImages, emptyBody, error, hasMore, imageSources, loading, loadingOlder, messages, modelLabel, modelLoading,
  onAttach, onCompose, onDraft, onLoadOlder, onMenu, onMore, onOpenModels, onRemoveImage, onSend,
  selected, sending, status, styles, theme,
}: SharedScreenProps & {
  activities: LiveActivity[]
  draft: string
  draftImages: readonly DraftImage[]
  emptyBody: string
  error: string | null
  hasMore: boolean
  imageSources: Readonly<Record<string, string>>
  loading: boolean
  loadingOlder: boolean
  messages: TranscriptMessage[]
  modelLabel: string
  modelLoading: boolean
  onAttach: () => void
  onCompose: () => void
  onDraft: (value: string) => void
  onLoadOlder: () => Promise<void>
  onMenu: () => void
  onMore: () => void
  onOpenModels: () => void
  onRemoveImage: (id: string) => void
  onSend: () => Promise<void>
  selected: boolean
  sending: boolean
  status: ConnectionStatus
}): React.JSX.Element {
  const listRef = useRef<FlatList<TranscriptMessage>>(null)
  const lastMessageSignatureRef = useRef<string | null>(null)
  const shouldScrollToEnd = useRef(true)
  const initialScrollScheduled = useRef(false)
  const [initialScrollComplete, setInitialScrollComplete] = useState(false)
  const canSend = selected && (draft.trim().length > 0 || draftImages.length > 0) && status === 'connected' && !sending
  const latestMessage = messages.at(-1)
  const latestTurnIndex = [...activities].map(activity => activity.kind).lastIndexOf('turn')
  const inlineActivities = activities.slice(latestTurnIndex >= 0 ? latestTurnIndex : Math.max(0, activities.length - 8)).slice(-8)
  const activityInFlight = inlineActivities.some(activity => activity.status === 'active' || activity.status === 'waiting')
  const inlineMessageId = latestMessage?.role === 'assistant' && inlineActivities.length > 0 ? latestMessage.id : null
  const showInlineActivities = inlineActivities.length > 0 && (activityInFlight || inlineMessageId !== null)
  useEffect(() => {
    const last = messages.at(-1)
    const lastActivity = activities.at(-1)
    const signature = `${last === undefined ? '' : `${last.id}:${String(last.text.length)}:${String(last.streaming === true)}`}`
      + `|${lastActivity === undefined ? '' : `${lastActivity.id}:${lastActivity.status}:${String(lastActivity.detail?.length ?? 0)}`}`
    if (signature === lastMessageSignatureRef.current) return
    lastMessageSignatureRef.current = signature
    shouldScrollToEnd.current = true
  }, [activities, messages])
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style={theme.background === '#151517' ? 'light' : 'dark'} />
      <BrandHeader onCompose={onCompose} onMenu={onMenu} onMore={onMore} status={status} styles={styles} theme={theme} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={0}>
        {loading
          ? <View style={styles.center}><ActivityIndicator color={theme.blue} /></View>
          : <FlatList
            ref={listRef}
            contentContainerStyle={messages.length === 0 && !showInlineActivities ? styles.emptyConversation : styles.messageList}
            data={messages}
            keyExtractor={message => message.id}
            maintainVisibleContentPosition={initialScrollComplete ? { minIndexForVisible: 0 } : undefined}
            onContentSizeChange={() => {
              if (!initialScrollComplete && messages.length > 0) {
                if (initialScrollScheduled.current) return
                initialScrollScheduled.current = true
                requestAnimationFrame(() => {
                  listRef.current?.scrollToEnd({ animated: false })
                  requestAnimationFrame(() => {
                    listRef.current?.scrollToEnd({ animated: false })
                    shouldScrollToEnd.current = false
                    setInitialScrollComplete(true)
                  })
                })
                return
              }
              if (!shouldScrollToEnd.current) return
              shouldScrollToEnd.current = false
              listRef.current?.scrollToEnd({ animated: false })
            }}
            renderItem={({ item }) => <MessageRow
              activities={item.id === inlineMessageId ? inlineActivities : []}
              imageSources={imageSources}
              message={item}
              styles={styles}
              theme={theme}
            />}
            ListFooterComponent={showInlineActivities && inlineMessageId === null
              ? <InlineAssistantProcess activities={inlineActivities} styles={styles} theme={theme} />
              : null}
            ListHeaderComponent={hasMore || loadingOlder
              ? <View style={styles.historyHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.loadOlder}
                  disabled={loadingOlder}
                  onPress={() => { void onLoadOlder() }}
                  style={({ pressed }) => [styles.loadOlderButton, pressed && !loadingOlder && styles.pressed]}
                >
                  {loadingOlder && <ActivityIndicator color={theme.blue} size="small" />}
                  <Text style={styles.loadOlderText}>{loadingOlder ? copy.loadingOlder : copy.loadOlder}</Text>
                </Pressable>
              </View>
              : null}
            ListEmptyComponent={
              <View style={styles.conversationEmptyState}>
                {status !== 'connected' && <ActivityIndicator color={theme.blue} size="small" />}
                <Text style={styles.emptyBody}>{selected ? copy.emptyChat : emptyBody}</Text>
              </View>
            }
          />}
        {error !== null && <Text accessibilityRole="alert" style={styles.composerError}>{error}</Text>}
        <View style={styles.composerDock}>
          {draftImages.length > 0 && (
            <ScrollView
              contentContainerStyle={styles.attachmentRailContent}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.attachmentRail}
            >
              {draftImages.map(image => (
                <View key={image.id} style={styles.attachmentPreview}>
                  <Image source={{ uri: image.uri }} style={styles.attachmentPreviewImage} />
                  <Pressable
                    accessibilityLabel={`${copy.removeImage}: ${image.name}`}
                    accessibilityRole="button"
                    onPress={() => onRemoveImage(image.id)}
                    style={styles.attachmentRemove}
                  >
                    <Text style={styles.attachmentRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.composer}>
            <IconButton
              accessibilityLabel={copy.attach}
              disabled={!selected || status !== 'connected' || sending}
              icon="attachPlus"
              onPress={onAttach}
              quiet
              size="compact"
              styles={styles}
              theme={theme}
            />
            <TextInput
              accessibilityLabel={copy.placeholder}
              editable={selected && !sending}
              maxLength={100_000}
              maxFontSizeMultiplier={1}
              multiline
              onChangeText={onDraft}
              placeholder={copy.placeholder}
              placeholderTextColor={theme.tertiary}
              style={styles.composerInput}
              value={draft}
            />
            <Pressable
              accessibilityLabel={`${copy.chooseModel}: ${modelLabel}`}
              accessibilityRole="button"
              disabled={!selected || status !== 'connected' || modelLoading}
              onPress={onOpenModels}
              style={({ pressed }) => [styles.modelLabel, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.modelText}>{modelLabel}</Text>
              <ReferenceIcon color={theme.tertiary} icon="modelChevron" />
            </Pressable>
            <IconButton
              accessibilityLabel={copy.microphone}
              disabled
              icon="microphone"
              quiet
              size="compact"
              styles={styles}
              theme={theme}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.send}
              disabled={!canSend}
              onPress={() => { void onSend() }}
              style={({ pressed }) => [styles.sendButton, pressed && canSend && styles.pressed]}
            >
              {sending
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : canSend
                  ? <View style={styles.sendVisualActive}><Text style={styles.sendArrow}>↑</Text></View>
                  : <Image resizeMode="contain" source={uiAssets.voiceButton} style={styles.sendVoiceImage} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Preserve the Host's stable error code while keeping the existing short UI message. */
function formatRpcError(fallback: string, error: unknown): string {
  if (error instanceof MobileRpcError) return `${fallback} (${error.code}: ${error.message})`
  if (error instanceof Error && error.message.length > 0) return `${fallback} (${error.message})`
  return fallback
}

/** Return the decoded byte count without allocating a second copy of the image. */
function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding)
}

/** Read a picker-copied image as base64 for the encrypted prompt frame. */
async function readImageBase64(uri: string): Promise<string> {
  return await new File(uri).base64()
}

/** Normalize picker metadata to the four image formats accepted by the host. */
function imageMediaType(mimeType: string | null | undefined, name: string): ImageMediaType | null {
  const normalized = mimeType?.toLowerCase()
  if (normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp' || normalized === 'image/gif') {
    return normalized
  }
  const extension = name.split('.').at(-1)?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  return null
}

/** Resolve the selected provider model's display name without owning a fallback catalog. */
function selectedModelName(models: SessionModels | null): string {
  if (models === null) return copy.model
  for (const group of models.groups) {
    const model = group.models.find(candidate => candidate.id === models.current.model && group.id === models.current.provider)
    if (model !== undefined) return model.name
  }
  return models.current.model
}

/** Bottom action sheet for the composer plus button. */
function AttachmentMenu({ onClose, onImage, onWorkspace, styles, theme, visible }: SharedScreenProps & {
  onClose: () => void
  onImage: () => void
  onWorkspace: () => void
  visible: boolean
}): React.JSX.Element {
  const options: readonly { label: string; icon: 'attachPlus' | 'folder'; onPress: () => void }[] = [
    { label: copy.image, icon: 'attachPlus', onPress: onImage },
    { label: copy.workspace, icon: 'folder', onPress: onWorkspace },
  ]
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.actionModalLayer}>
        <Pressable accessibilityLabel={copy.cancel} accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.actionSheet}>
          <Text accessibilityRole="header" style={styles.actionSheetTitle}>{copy.chooseAttachment}</Text>
          {options.map(option => (
            <Pressable accessibilityRole="button" key={option.label} onPress={option.onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}>
              <View style={styles.actionIcon}><ReferenceIcon color={theme.text} icon={option.icon} /></View>
              <Text style={styles.actionLabel}>{option.label}</Text>
              <ReferenceIcon color={theme.tertiary} icon="chevronRight" />
            </Pressable>
          ))}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

/** Existing Host workspaces available for creating a new conversation. */
function WorkspacePicker({ currentSessionId, loading, onClose, onSelect, styles, theme, views, visible }: SharedScreenProps & {
  currentSessionId: string | null
  loading: boolean
  onClose: () => void
  onSelect: (workspaceId: string) => void
  views: readonly WorkspaceSummary[]
  visible: boolean
}): React.JSX.Element {
  const currentWorkspaceId = views.find(view => currentSessionId !== null && view.sessionIds.includes(currentSessionId))?.workspaceId
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.modelModalLayer}>
        <Pressable accessibilityLabel={copy.cancel} accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modelSheet}>
          <View style={styles.modelSheetHeader}>
            <Text accessibilityRole="header" style={styles.modelSheetTitle}>{copy.chooseWorkspace}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.modelSheetClose}>
              <Text style={styles.modelSheetCloseText}>×</Text>
            </Pressable>
          </View>
          {views.length === 0
            ? <View style={styles.modelSheetState}><Text style={styles.modelSheetStateText}>{copy.noWorkspaces}</Text></View>
            : <ScrollView contentContainerStyle={styles.modelList}>
              {views.map((view) => {
                const current = view.workspaceId === currentWorkspaceId
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: current, disabled: loading }}
                    disabled={loading}
                    key={view.workspaceId}
                    onPress={() => onSelect(view.workspaceId)}
                    style={({ pressed }) => [styles.workspacePickerRow, current && styles.modelRowCurrent, pressed && styles.rowPressed]}
                  >
                    <ReferenceIcon color={theme.text} icon="folder" />
                    <View style={styles.workspacePickerCopy}>
                      <Text numberOfLines={1} style={styles.modelRowName}>{view.title}</Text>
                      <Text numberOfLines={1} style={styles.modelRowDescription}>{view.path}</Text>
                    </View>
                    {current && <Text style={styles.modelCheck}>✓</Text>}
                  </Pressable>
                )
              })}
            </ScrollView>}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

/** Native bottom sheet backed by the same per-session model directory as the browser. */
function ModelPicker({ loading, models, onClose, onRetry, onSelect, refreshing, styles, theme, visible }: SharedScreenProps & {
  loading: boolean
  models: SessionModels | null
  onClose: () => void
  onRetry: () => void
  onSelect: (group: ModelProviderGroup, model: ModelCatalogModel) => void
  refreshing: boolean
  visible: boolean
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.modelModalLayer}>
        <Pressable accessibilityLabel={copy.cancel} accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modelSheet}>
          <View style={styles.modelSheetHeader}>
            <Text accessibilityRole="header" style={styles.modelSheetTitle}>{copy.chooseModel}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.modelSheetClose}>
              <Text style={styles.modelSheetCloseText}>×</Text>
            </Pressable>
          </View>
          {(loading || refreshing) && models === null
            ? <View style={styles.modelSheetState}><ActivityIndicator color={theme.blue} /></View>
            : models === null
              ? <View style={styles.modelSheetState}>
                <Text style={styles.modelSheetStateText}>{copy.modelLoadError}</Text>
                <Pressable accessibilityRole="button" onPress={onRetry} style={styles.modelRetry}>
                  <Text style={styles.modelRetryText}>{copy.retry}</Text>
                </Pressable>
              </View>
              : <ScrollView contentContainerStyle={styles.modelList} showsVerticalScrollIndicator={false}>
                {!models.routable && <Text style={styles.modelFailure}>{copy.modelUnavailable}</Text>}
                {models.groups.length === 0 && <Text style={styles.modelSheetStateText}>{copy.noModels}</Text>}
                {models.groups.map(group => (
                  <View key={group.id} style={styles.modelGroup}>
                    <Text style={styles.modelGroupTitle}>{group.name}</Text>
                    {group.models.map((model) => {
                      const current = models.current.provider === group.id && models.current.model === model.id
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: current, disabled: loading }}
                          disabled={loading}
                          key={`${group.id}/${model.id}`}
                          onPress={() => onSelect(group, model)}
                          style={({ pressed }) => [styles.modelRow, current && styles.modelRowCurrent, pressed && styles.rowPressed]}
                        >
                          <View style={styles.modelRowCopy}>
                            <Text numberOfLines={1} style={styles.modelRowName}>{model.name}</Text>
                            {model.description !== undefined && (
                              <Text numberOfLines={2} style={styles.modelRowDescription}>{model.description}</Text>
                            )}
                          </View>
                          {current && <Text style={styles.modelCheck}>✓</Text>}
                        </Pressable>
                      )
                    })}
                  </View>
                ))}
                {models.failures.map(failure => (
                  <Text key={failure.id} style={styles.modelFailure}>{failure.name}: {failure.message}</Text>
                ))}
              </ScrollView>}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

/** Saved computer selector and pairing entry point. */
function DeviceManager({ activeHostId, hosts, onClose, onForget, onPair, onSelect, styles, theme, visible }: SharedScreenProps & {
  activeHostId: string
  hosts: readonly StoredPairedHost[]
  onClose: () => void
  onForget: (id: string) => Promise<void>
  onPair: () => void
  onSelect: (id: string) => void
  visible: boolean
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.deviceSheet}>
        <View style={styles.settingsHeader}>
          <Text accessibilityRole="header" style={styles.settingsTitle}>{copy.settingsDevices}</Text>
          <Pressable accessibilityLabel={copy.cancel} accessibilityRole="button" onPress={onClose} style={styles.modelSheetClose}>
            <Text style={styles.modelSheetCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.deviceList}>
          {hosts.length === 0 && <Text style={styles.deviceEmpty}>{copy.noSavedDevices}</Text>}
          {hosts.map((host) => {
            const active = host.id === activeHostId
            let endpoint = host.offer.endpoint
            try { endpoint = new URL(host.offer.endpoint).host } catch { /* keep the validated endpoint */ }
            return (
              <View key={host.id} style={[styles.deviceCard, active && styles.deviceCardActive]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(host.id)}
                  style={({ pressed }) => [styles.deviceSelectRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.deviceGlyph}><ReferenceIcon color={active ? theme.blue : theme.text} icon="settings" scale={0.82} /></View>
                  <View style={styles.deviceCopy}>
                    <Text numberOfLines={1} style={styles.deviceName}>{host.label}</Text>
                    <Text numberOfLines={1} style={styles.deviceEndpoint}>{endpoint}</Text>
                  </View>
                  {active && <Text style={styles.deviceCurrent}>{copy.deviceSelected}</Text>}
                  {!active && <ReferenceIcon color={theme.tertiary} icon="chevronRight" />}
                </Pressable>
                {active && <Pressable
                  accessibilityRole="button"
                  onPress={() => Alert.alert(copy.removeDeviceTitle, copy.removeDeviceBody, [
                    { text: copy.cancel, style: 'cancel' },
                    { text: copy.removeDevice, style: 'destructive', onPress: () => { void onForget(host.id) } },
                  ])}
                  style={({ pressed }) => [styles.deviceRemove, pressed && styles.rowPressed]}
                >
                  <Text style={styles.deviceRemoveText}>{copy.removeDevice}</Text>
                </Pressable>}
              </View>
            )
          })}
          <Pressable accessibilityRole="button" onPress={onPair} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{copy.addDevice}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

/** Native settings sheet with the desktop-aligned entry points. */
function SettingsPanel({ onClose, onOpenDevices, styles, theme, visible }: SharedScreenProps & {
  onClose: () => void
  onOpenDevices: () => void
  visible: boolean
}): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const options: readonly { label: string; icon: Exclude<UiAssetName, 'brandLockup' | 'voiceButton'> }[] = [
    { label: copy.settingsDevices, icon: 'compose' },
    { label: copy.settingsGeneral, icon: 'settings' },
    { label: copy.settingsModels, icon: 'filter' },
    { label: copy.settingsPlugins, icon: 'addSquare' },
    { label: copy.settingsAgentPresets, icon: 'message' },
  ]
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.settingsSheet}>
        <View style={styles.settingsHeader}>
          <Text accessibilityRole="header" style={styles.settingsTitle}>{copy.settings}</Text>
          <Pressable accessibilityLabel={copy.cancel} accessibilityRole="button" onPress={onClose} style={styles.modelSheetClose}>
            <Text style={styles.modelSheetCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.settingsList}>
          {options.map((option) => {
            const active = selected === option.label
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={option.label}
                onPress={() => {
                  if (option.label === copy.settingsDevices) {
                    onOpenDevices()
                    return
                  }
                  setSelected(option.label)
                }}
                style={({ pressed }) => [styles.settingsOption, active && styles.settingsOptionActive, pressed && styles.rowPressed]}
              >
                <ReferenceIcon color={theme.text} icon={option.icon} />
                <Text style={styles.settingsOptionText}>{option.label}</Text>
                <ReferenceIcon color={theme.tertiary} icon="chevronRight" />
              </Pressable>
            )
          })}
          {selected !== null && <View style={styles.settingsPlaceholder}>
            <Text style={styles.settingsPlaceholderTitle}>{selected}</Text>
            <Text style={styles.settingsPlaceholderBody}>{copy.settingsPending}</Text>
          </View>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

/** Branded native application bar shared by every selected conversation. */
function BrandHeader({ onCompose, onMenu, onMore, status, styles, theme }: SharedScreenProps & {
  onCompose: () => void
  onMenu: () => void
  onMore: () => void
  status: ConnectionStatus
}): React.JSX.Element {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandHeaderSide}>
        <IconButton accessibilityLabel={copy.menu} icon="menu" onPress={onMenu} styles={styles} theme={theme} />
      </View>
      <BrandWordmark status={status} styles={styles} theme={theme} />
      <View style={[styles.brandHeaderSide, styles.brandHeaderActions]}>
        <IconButton accessibilityLabel={copy.compose} icon="compose" onPress={onCompose} styles={styles} theme={theme} />
        <IconButton accessibilityLabel={copy.more} icon="more" onPress={onMore} styles={styles} theme={theme} />
      </View>
    </View>
  )
}

/** Reference-derived DeepSeek Harness lockup from the approved mobile composition. */
function BrandWordmark({ drawer = false, status, styles, theme }: SharedScreenProps & {
  drawer?: boolean
  status: ConnectionStatus
}): React.JSX.Element {
  const statusLabel = status === 'connected' ? copy.connected : status === 'connecting' ? copy.connecting : status === 'offline' ? copy.offline : copy.error
  return (
    <View accessibilityLabel={`${copy.app}, ${statusLabel}`} style={styles.brandWordmark}>
      <Image
        resizeMode="contain"
        source={uiAssets.brandLockup}
        style={[styles.brandLockup, drawer && styles.brandLockupDrawer, { tintColor: theme.text }]}
      />
    </View>
  )
}

/** Reference-derived glyph inside a platform-sized icon target. */
function IconButton({ accessibilityLabel, disabled = false, icon, onPress, quiet = false, size = 'regular', styles, theme }: SharedScreenProps & {
  accessibilityLabel: string
  disabled?: boolean
  icon: Exclude<UiAssetName, 'brandLockup' | 'voiceButton'>
  onPress?: () => void
  quiet?: boolean
  size?: 'compact' | 'regular'
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[
        styles.iconButtonVisual,
        size === 'compact' && styles.iconButtonVisualCompact,
        quiet && styles.iconButtonQuiet,
      ]}>
        <ReferenceIcon color={theme.text} icon={icon} scale={size === 'compact' ? 0.92 : 1} />
      </View>
    </Pressable>
  )
}

/** Pixel-preserving reference asset with semantic theme tint. */
function ReferenceIcon({ color, icon, scale = 1 }: {
  color: string
  icon: Exclude<UiAssetName, 'brandLockup' | 'voiceButton'>
  scale?: number
}): React.JSX.Element {
  const metric = iconMetrics[icon]
  return (
    <Image
      resizeMode="contain"
      source={uiAssets[icon]}
      style={{ width: metric.width * scale, height: metric.height * scale, tintColor: color }}
    />
  )
}

interface WorkspaceGroup {
  key: string
  label: string
  sessions: SessionSummary[]
}

/** Session navigation grouped into workspaces and recent conversations. */
function SessionDrawer({
  currentSessionId,
  creating,
  onClose,
  onForget,
  onNewSession,
  onOpenSession,
  onOpenSettings,
  onRefresh,
  refreshing,
  sessions,
  status,
  styles,
  theme,
  visible,
}: SharedScreenProps & {
  currentSessionId: string | null
  creating: boolean
  onClose: () => void
  onForget: () => void
  onNewSession: () => void
  onOpenSession: (sessionId: string) => void
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing: boolean
  sessions: SessionSummary[]
  status: ConnectionStatus
  visible: boolean
}): React.JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'recent' | 'name'>('recent')
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(() => new Set())
  const expandedInitialized = useRef(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const workspaces = useMemo(() => {
    const filtered = normalizedQuery.length === 0
      ? sessions
      : sessions.filter(session => sessionTitle(session).toLocaleLowerCase().includes(normalizedQuery)
        || (session.cwd?.toLocaleLowerCase().includes(normalizedQuery) ?? false))
    const groups = groupSessionsByWorkspace(filtered)
    return groups.sort((left, right) => sortMode === 'name'
      ? left.label.localeCompare(right.label)
      : Math.max(...right.sessions.map(session => session.updatedAt)) - Math.max(...left.sessions.map(session => session.updatedAt)))
  }, [normalizedQuery, sessions, sortMode])
  const recentSessions = useMemo(() => {
    const filtered = normalizedQuery.length === 0
      ? sessions
      : sessions.filter(session => sessionTitle(session).toLocaleLowerCase().includes(normalizedQuery)
        || (session.cwd?.toLocaleLowerCase().includes(normalizedQuery) ?? false))
    return [...filtered].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 5)
  }, [normalizedQuery, sessions])
  const currentSession = sessions.find(session => session.sessionId === currentSessionId)
  const currentWorkspace = currentSession?.cwd ?? currentSession?.sessionId
  useEffect(() => {
    if (expandedInitialized.current || workspaces[0] === undefined) return
    expandedInitialized.current = true
    setExpandedWorkspaces(new Set([workspaces[0].key]))
  }, [workspaces])
  const toggleWorkspace = (key: string): void => {
    setExpandedWorkspaces((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const organize = (): void => {
    Alert.alert(copy.organize, undefined, [
      { text: copy.sortRecent, onPress: () => setSortMode('recent') },
      { text: copy.sortName, onPress: () => setSortMode('name') },
      { text: copy.expandAll, onPress: () => setExpandedWorkspaces(new Set(workspaces.map(workspace => workspace.key))) },
      { text: copy.collapseAll, onPress: () => setExpandedWorkspaces(new Set()) },
      { text: copy.cancel, style: 'cancel' },
    ])
  }
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.drawerLayer}>
        <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.drawerPanel}>
          <View style={styles.drawerBrandRow}>
            <BrandWordmark drawer status={status} styles={styles} theme={theme} />
            <IconButton accessibilityLabel={copy.search} icon="search" onPress={() => setSearchOpen(previous => !previous)} quiet styles={styles} theme={theme} />
          </View>
          <View style={styles.drawerStatus}><ConnectionPill compact status={status} styles={styles} /></View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: creating }}
            disabled={creating}
            onPress={onNewSession}
            style={({ pressed }) => [styles.newConversationButton, pressed && styles.rowPressed]}
          >
            {creating
              ? <ActivityIndicator color={theme.blue} size="small" />
              : <ReferenceIcon color={theme.text} icon="newConversation" />}
            <Text style={styles.newConversationText}>{creating ? copy.connecting : copy.compose}</Text>
          </Pressable>
          {searchOpen && <View style={styles.drawerSearchWrap}>
            <TextInput
              accessibilityLabel={copy.search}
              autoFocus
              onChangeText={setQuery}
              placeholder={copy.search}
              placeholderTextColor={theme.tertiary}
              style={styles.drawerSearchInput}
              value={query}
            />
          </View>}
          <ScrollView
            contentContainerStyle={styles.drawerScrollContent}
            refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={theme.blue} />}
            showsVerticalScrollIndicator={false}
            style={styles.drawerScroll}
          >
            <View style={styles.drawerSectionHeader}>
              <Text style={styles.drawerSectionTitle}>{copy.workspaces}</Text>
              <View style={styles.drawerSectionActions}>
                <IconButton accessibilityLabel={copy.search} icon="search" onPress={() => setSearchOpen(previous => !previous)} quiet size="compact" styles={styles} theme={theme} />
                <IconButton accessibilityLabel={copy.organize} icon="filter" onPress={organize} quiet size="compact" styles={styles} theme={theme} />
                <IconButton accessibilityLabel={copy.compose} disabled icon="addSquare" quiet size="compact" styles={styles} theme={theme} />
              </View>
            </View>
            <View style={styles.workspaceList}>
              {workspaces.map((workspace) => {
                const expanded = expandedWorkspaces.has(workspace.key)
                const selected = currentWorkspace === workspace.key
                return (
                  <View key={workspace.key}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => toggleWorkspace(workspace.key)}
                      style={({ pressed }) => [styles.workspaceRow, selected && styles.workspaceRowSelected, pressed && styles.rowPressed]}
                    >
                      <ReferenceIcon color={theme.text} icon="folder" />
                      <Text numberOfLines={1} style={styles.workspaceLabel}>{workspace.label}</Text>
                      <ReferenceIcon color={theme.text} icon={expanded ? 'chevronDown' : 'chevronRight'} />
                    </Pressable>
                    {expanded && workspace.sessions.map(session => (
                      <DrawerSessionRow
                        compact
                        key={session.sessionId}
                        onPress={() => onOpenSession(session.sessionId)}
                        selected={session.sessionId === currentSessionId}
                        session={session}
                        styles={styles}
                        theme={theme}
                      />
                    ))}
                  </View>
                )
              })}
            </View>
            {normalizedQuery.length > 0 && workspaces.length === 0 && <Text style={styles.drawerEmptyText}>{copy.noSearchResults}</Text>}
            <View style={styles.drawerDivider} />
            <Text style={[styles.drawerSectionTitle, styles.drawerRecentTitle]}>{copy.recent}</Text>
            <View style={styles.recentList}>
              {recentSessions.map(session => (
                <DrawerSessionRow
                  key={session.sessionId}
                  onPress={() => onOpenSession(session.sessionId)}
                  selected={session.sessionId === currentSessionId}
                  session={session}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </View>
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable accessibilityRole="button" onPress={onOpenSettings} style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}>
              <ReferenceIcon color={theme.text} icon="settings" />
              <Text style={styles.settingsText}>{copy.settings}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        <Pressable accessibilityLabel={copy.back} accessibilityRole="button" onPress={onClose} style={styles.drawerScrim} />
      </View>
    </Modal>
  )
}

/** Compact session row used inside the drawer tree and recent list. */
function DrawerSessionRow({ compact = false, onPress, selected, session, styles, theme }: SharedScreenProps & {
  compact?: boolean
  onPress: () => void
  selected: boolean
  session: SessionSummary
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerSessionRow,
        compact && styles.drawerSessionRowIndented,
        selected && styles.drawerSessionRowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <ReferenceIcon color={theme.text} icon="message" />
      <Text numberOfLines={1} style={styles.drawerSessionText}>{sessionTitle(session)}</Text>
      {session.running && <View accessibilityLabel={copy.running} style={styles.drawerRunningDot} />}
    </Pressable>
  )
}

/** Stable workspace groups derived from session working directories. */
function groupSessionsByWorkspace(sessions: SessionSummary[]): WorkspaceGroup[] {
  const groups = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    const key = session.cwd ?? session.sessionId
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [session])
    else existing.push(session)
  }
  return [...groups].map(([key, grouped]) => ({
    key,
    label: key.split(/[\\/]/).filter(Boolean).at(-1) ?? copy.untitled,
    sessions: grouped,
  }))
}

/** Compare host and session paths consistently across Windows slash/case variants. */
function sameWorkspacePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replaceAll('/', '\\').replace(/\\+$/, '').toLocaleLowerCase()
  return normalize(left) === normalize(right)
}

/** Text-plus-color connection signal. */
function ConnectionPill({ status, styles, compact = false }: {
  status: ConnectionStatus
  styles: ReturnType<typeof createStyles>
  compact?: boolean
}): React.JSX.Element {
  const label = status === 'connected' ? copy.connected : status === 'connecting' ? copy.connecting : status === 'offline' ? copy.offline : copy.error
  return (
    <View accessibilityLabel={label} style={[styles.statusPill, compact && styles.statusPillCompact]}>
      <View style={[styles.statusDot, status === 'connected' ? styles.statusConnected : status === 'error' ? styles.statusError : styles.statusWaiting]} />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  )
}

/** Renders host progress in the same assistant bubble as the streaming reply. */
function InlineAssistantProcess({ activities, styles, theme }: SharedScreenProps & {
  activities: readonly LiveActivity[]
}): React.JSX.Element {
  return (
    <View style={styles.assistantMessageAlign} accessibilityLiveRegion="polite">
      <View style={styles.assistantAvatar}>
        <ReferenceIcon color={theme.text} icon="assistantWhale" />
      </View>
      <View style={[styles.assistantBubble, styles.assistantBubbleProcess]}>
        <InlineActivityRows activities={activities} styles={styles} theme={theme} />
      </View>
    </View>
  )
}

/** Interleaves context, thinking, tools, and waiting states before assistant text. */
function InlineActivityRows({ activities, styles }: SharedScreenProps & {
  activities: readonly LiveActivity[]
}): React.JSX.Element {
  return (
    <View style={styles.inlineActivities} accessibilityLiveRegion="polite">
      {activities.map((activity, index) => (
        <View key={activity.id} style={[styles.inlineActivityRow, index > 0 && styles.inlineActivityRowSeparated]}>
          <View style={[styles.inlineActivityMarker, activity.status === 'active' && styles.inlineActivityMarkerActive, activity.status === 'waiting' && styles.inlineActivityMarkerWaiting, activity.status === 'error' && styles.inlineActivityMarkerError]} />
          <View style={styles.inlineActivityCopy}>
            <Text style={styles.inlineActivityTitle}>{activity.title}</Text>
            {activity.detail !== undefined && activity.detail.length > 0 && (
              <Text selectable numberOfLines={4} style={styles.inlineActivityDetail}>{activity.detail}</Text>
            )}
          </View>
          <Text style={styles.inlineActivityStatus}>{activity.status === 'active' ? '…' : activity.status === 'waiting' ? '?' : activity.status === 'error' ? '!' : '✓'}</Text>
        </View>
      ))}
    </View>
  )
}

/** One selectable plain-text message row. */
function MessageRow({
  activities,
  imageSources,
  message,
  styles,
  theme,
}: SharedScreenProps & {
  activities: readonly LiveActivity[]
  imageSources: Readonly<Record<string, string>>
  message: TranscriptMessage
}): React.JSX.Element {
  const images = message.images ?? []
  const imageViews = images.length > 0 && (
    <View style={styles.messageImages}>
      {images.map(image => (
        <Image
          accessibilityLabel={image.name ?? image.mediaType}
          key={image.attachmentId}
          source={imageSources[image.attachmentId] === undefined ? undefined : { uri: imageSources[image.attachmentId] }}
          style={styles.messageImage}
        />
      ))}
    </View>
  )
  if (message.role === 'user') {
    return (
      <View style={styles.userMessageAlign}>
        <View style={styles.userBubble}>
          {message.text.length > 0 && <Text selectable style={styles.messageText}>{message.text}{message.streaming ? ' ▍' : ''}</Text>}
          {imageViews}
        </View>
      </View>
    )
  }
  return (
    <View style={styles.assistantMessageAlign}>
      <View style={styles.assistantAvatar}>
        <ReferenceIcon color={theme.text} icon="assistantWhale" />
      </View>
      <View style={styles.assistantBubble}>
        {activities.length > 0 && <InlineActivityRows activities={activities} styles={styles} theme={theme} />}
        {message.text.length > 0 && <Text selectable style={styles.messageText}>{message.text}{message.streaming ? ' ▍' : ''}</Text>}
        {imageViews}
      </View>
    </View>
  )
}

/** Best available list title, preserving the browser projection's semantics. */
function sessionTitle(session: SessionSummary | null): string {
  if (session === null) return copy.untitled
  const title = session.projections?.values.title
  if (typeof title === 'string' && title.trim().length > 0) return title
  if (session.cwd !== undefined) return session.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? copy.untitled
  return copy.untitled
}

/** Theme-bound native style sheet. */
function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    appShell: { flex: 1, backgroundColor: theme.background },
    screen: { flex: 1, backgroundColor: theme.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: theme.background },
    pairingContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
    brandMark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.blue },
    brandMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
    pairTitle: { marginTop: 24, color: theme.text, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
    pairBody: { marginTop: 12, color: theme.secondary, fontSize: 17, lineHeight: 25 },
    primaryButton: { minHeight: 52, marginTop: 24, borderRadius: 16, backgroundColor: theme.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600' },
    fieldLabel: { marginTop: 24, marginBottom: 8, color: theme.secondary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    pairInput: {
      minHeight: 74, maxHeight: 110, paddingHorizontal: 16, paddingVertical: 12,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, borderRadius: 12,
      color: theme.text, backgroundColor: theme.input, fontSize: 15, lineHeight: 21,
    },
    secondaryButton: { minHeight: 52, marginTop: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
    secondaryButtonText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    disabled: { opacity: 0.42 }, pressed: { opacity: 0.72 },
    securityText: { marginTop: 24, color: theme.tertiary, fontSize: 13, lineHeight: 19 },
    permissionText: { color: theme.secondary, textAlign: 'center', fontSize: 16, lineHeight: 23 },
    textButton: { minWidth: 88, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    textButtonText: { color: theme.blue, fontSize: 16, fontWeight: '600' },
    cameraScreen: { flex: 1, backgroundColor: '#000000' },
    cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 244, height: 244, borderRadius: 24, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'transparent' },
    cameraCancel: { position: 'absolute', bottom: 30, minWidth: 108, minHeight: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.64)', alignItems: 'center', justifyContent: 'center' },
    cameraCancelText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    brandHeader: { minHeight: 72, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
    brandHeaderSide: { width: 48, flexDirection: 'row', alignItems: 'center' },
    brandHeaderActions: { width: 100, justifyContent: 'flex-end', gap: 4 },
    brandWordmark: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
    brandLockup: { width: 150, height: 20 },
    brandLockupDrawer: { width: 140, height: 19 },
    iconButton: {
      width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
    },
    iconButtonVisual: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.elevated,
      shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
    },
    iconButtonVisualCompact: { width: 36, height: 36, borderRadius: 18 },
    iconButtonQuiet: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
    iconButtonDisabled: { opacity: 1 },
    statusPill: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusPillCompact: { marginTop: 0 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusConnected: { backgroundColor: theme.green },
    statusWaiting: { backgroundColor: theme.amber },
    statusError: { backgroundColor: theme.red },
    statusText: { color: theme.tertiary, fontSize: 12, lineHeight: 16, fontWeight: '500' },
    emptyTitle: { color: theme.text, fontSize: 19, lineHeight: 25, fontWeight: '600', textAlign: 'center' },
    emptyBody: { marginTop: 8, color: theme.secondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    messageList: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16, gap: 24 },
    historyHeader: { alignItems: 'center', paddingBottom: 4 },
    loadOlderButton: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    loadOlderText: { color: theme.blue, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    inlineActivities: { marginBottom: 10, gap: 8 },
    inlineActivityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
    inlineActivityRowSeparated: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    inlineActivityMarker: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: theme.green },
    inlineActivityMarkerActive: { backgroundColor: theme.blue },
    inlineActivityMarkerWaiting: { backgroundColor: theme.amber },
    inlineActivityMarkerError: { backgroundColor: theme.red },
    inlineActivityCopy: { flex: 1, gap: 1 },
    inlineActivityTitle: { color: theme.secondary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    inlineActivityDetail: { color: theme.tertiary, fontSize: 13, lineHeight: 18 },
    inlineActivityStatus: { minWidth: 18, color: theme.tertiary, fontSize: 13, lineHeight: 18, textAlign: 'right' },
    emptyConversation: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    conversationEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    userMessageAlign: { alignItems: 'flex-end' },
    assistantMessageAlign: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    userBubble: { maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, backgroundColor: theme.surface },
    assistantAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.elevated },
    assistantBubble: { flexShrink: 1, maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.background },
    assistantBubbleProcess: { flexGrow: 1 },
    messageText: { color: theme.text, fontSize: 15, lineHeight: 23 },
    messageImages: { marginTop: 8, gap: 8 },
    messageImage: { width: 220, height: 160, borderRadius: 12, backgroundColor: theme.surface },
    composerError: { paddingHorizontal: 16, paddingTop: 8, color: theme.red, fontSize: 13, backgroundColor: theme.background },
    composerDock: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: theme.background },
    attachmentRail: { maxHeight: 76, marginBottom: 8 },
    attachmentRailContent: { gap: 8, paddingHorizontal: 4 },
    attachmentPreview: { width: 68, height: 68 },
    attachmentPreviewImage: { width: 68, height: 68, borderRadius: 12, backgroundColor: theme.surface },
    attachmentRemove: {
      position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', backgroundColor: theme.text,
    },
    attachmentRemoveText: { color: theme.background, fontSize: 18, lineHeight: 20, fontWeight: '600' },
    composer: {
      minHeight: 56, paddingHorizontal: 4, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
      backgroundColor: theme.input, flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    composerInput: {
      flex: 1, minWidth: 84, minHeight: 48, maxHeight: 112, color: theme.text,
      paddingHorizontal: 0, paddingVertical: 12, fontSize: 12, lineHeight: 18,
    },
    modelLabel: { maxWidth: 76, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
    modelText: { flexShrink: 1, color: theme.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
    modelModalLayer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.52)' },
    actionModalLayer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
    actionSheet: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: theme.background,
    },
    actionSheetTitle: { paddingHorizontal: 8, paddingBottom: 8, color: theme.tertiary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    actionRow: { minHeight: 58, paddingHorizontal: 8, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
    actionLabel: { flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '500' },
    modelSheet: {
      maxHeight: '76%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
      backgroundColor: theme.background, overflow: 'hidden',
    },
    modelSheetHeader: {
      minHeight: 64, paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    modelSheetTitle: { flex: 1, color: theme.text, fontSize: 20, lineHeight: 26, fontWeight: '600' },
    modelSheetClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    modelSheetCloseText: { color: theme.secondary, fontSize: 28, lineHeight: 32 },
    modelSheetState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    modelSheetStateText: { color: theme.secondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    modelRetry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
    modelRetryText: { color: theme.blue, fontSize: 15, lineHeight: 20, fontWeight: '600' },
    modelList: { paddingHorizontal: 12, paddingVertical: 12, gap: 20 },
    modelGroup: { gap: 4 },
    modelGroupTitle: { paddingHorizontal: 12, paddingVertical: 8, color: theme.tertiary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    modelRow: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    modelRowCurrent: { backgroundColor: theme.surface },
    modelRowCopy: { flex: 1, gap: 2 },
    modelRowName: { color: theme.text, fontSize: 16, lineHeight: 22, fontWeight: '500' },
    modelRowDescription: { color: theme.tertiary, fontSize: 13, lineHeight: 18 },
    workspacePickerRow: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    workspacePickerCopy: { flex: 1, gap: 2 },
    modelCheck: { color: theme.blue, fontSize: 18, lineHeight: 22, fontWeight: '700' },
    modelFailure: { paddingHorizontal: 12, color: theme.red, fontSize: 13, lineHeight: 19 },
    sendButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    sendVoiceImage: { width: 32, height: 32 },
    sendVisualActive: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.blue },
    sendArrow: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '600' },
    drawerLayer: { flex: 1, flexDirection: 'row' },
    drawerPanel: { width: '72%', maxWidth: 400, backgroundColor: theme.background },
    drawerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
    drawerBrandRow: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
    drawerStatus: { paddingHorizontal: 24, paddingBottom: 8 },
    newConversationButton: {
      minHeight: 56, marginHorizontal: 16, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    newConversationText: { color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '500' },
    drawerSearchWrap: { paddingHorizontal: 16, paddingTop: 8 },
    drawerSearchInput: {
      minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border, backgroundColor: theme.input, color: theme.text, fontSize: 15,
    },
    drawerScroll: { flex: 1, marginTop: 24 },
    drawerScrollContent: { paddingBottom: 24 },
    drawerSectionHeader: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    drawerSectionTitle: { color: theme.secondary, fontSize: 18, lineHeight: 24, fontWeight: '500' },
    drawerRecentTitle: { marginHorizontal: 16 },
    drawerSectionActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    workspaceList: { marginTop: 12, gap: 4 },
    workspaceRow: { minHeight: 56, marginHorizontal: 8, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    workspaceRowSelected: { backgroundColor: theme.blueSoft },
    workspaceLabel: { flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '500' },
    drawerSessionRow: { minHeight: 52, marginHorizontal: 8, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    drawerSessionRowIndented: { paddingLeft: 48 },
    drawerSessionRowSelected: { backgroundColor: theme.surface },
    drawerSessionText: { flex: 1, color: theme.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
    drawerRunningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.blue },
    drawerDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginVertical: 24, backgroundColor: theme.border },
    recentList: { marginTop: 12, gap: 4 },
    drawerEmptyText: { paddingHorizontal: 16, paddingTop: 16, color: theme.tertiary, fontSize: 14, lineHeight: 20 },
    drawerFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingHorizontal: 16, paddingTop: 8 },
    settingsRow: { minHeight: 56, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
    settingsText: { color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '500' },
    settingsSheet: { flex: 1, backgroundColor: theme.background },
    settingsHeader: {
      minHeight: 72, paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    settingsTitle: { flex: 1, color: theme.text, fontSize: 22, lineHeight: 28, fontWeight: '600' },
    settingsList: { padding: 16, gap: 8 },
    settingsOption: {
      minHeight: 56, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    settingsOptionActive: { backgroundColor: theme.surface },
    settingsOptionText: { flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '500' },
    settingsPlaceholder: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: theme.surface },
    settingsPlaceholderTitle: { color: theme.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
    settingsPlaceholderBody: { marginTop: 6, color: theme.secondary, fontSize: 14, lineHeight: 20 },
    deviceSheet: { flex: 1, backgroundColor: theme.background },
    deviceList: { padding: 16, gap: 12 },
    deviceCard: { overflow: 'hidden', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.input },
    deviceCardActive: { borderColor: theme.blue, backgroundColor: theme.blueSoft },
    deviceSelectRow: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
    deviceGlyph: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.elevated },
    deviceCopy: { flex: 1, minWidth: 0, gap: 2 },
    deviceName: { color: theme.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
    deviceEndpoint: { color: theme.tertiary, fontSize: 13, lineHeight: 18 },
    deviceCurrent: { color: theme.blue, fontSize: 12, lineHeight: 18, fontWeight: '600' },
    deviceRemove: { minHeight: 44, paddingHorizontal: 66, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    deviceRemoveText: { color: theme.red, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    deviceEmpty: { paddingVertical: 20, color: theme.secondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    rowPressed: { backgroundColor: theme.surface },
  })
}
