import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useChat,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { TOKEN_ENDPOINT, resolveServerUrl } from './config';

const ADJECTIVES = ['warm', 'calm', 'bright', 'swift', 'quiet', 'bold', 'lucky', 'clever'];
const NOUNS = ['fox', 'otter', 'finch', 'cedar', 'river', 'ember', 'maple', 'comet'];

function randomRoomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}-${n}-${Math.floor(1000 + Math.random() * 9000)}`;
}

type Session = { token: string; serverUrl: string; room: string; name: string };

// Fetch a LiveKit token for a room and build a Session. Throws with a readable message.
async function fetchSession(roomName: string, name: string): Promise<Session> {
  const displayName = name.trim() || 'Guest';
  const cleanRoom = roomName.trim().replace(/[^a-zA-Z0-9-_]/g, '');
  if (!cleanRoom) throw new Error('Enter a meeting code, or tap New meeting.');
  const url = `${TOKEN_ENDPOINT}?room=${encodeURIComponent(cleanRoom)}&username=${encodeURIComponent(displayName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Token request failed (${res.status})`);
  }
  const data = (await res.json()) as { token?: string; serverUrl?: string };
  if (!data.token) throw new Error('No token returned by the server.');
  if (!data.serverUrl) {
    throw new Error('Server has no LiveKit URL configured (NEXT_PUBLIC_LIVEKIT_URL).');
  }
  return {
    token: data.token,
    serverUrl: resolveServerUrl(data.serverUrl),
    room: cleanRoom,
    name: displayName,
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  // A freshly created meeting waiting in the lobby (share the code, set a name, then join).
  const [lobby, setLobby] = useState<{ room: string; name: string } | null>(null);

  return (
    <SafeAreaProvider>
      {session ? (
        <RoomScreen
          session={session}
          onLeave={() => {
            setSession(null);
            setLobby(null);
          }}
        />
      ) : lobby ? (
        <LobbyScreen
          room={lobby.room}
          initialName={lobby.name}
          onJoin={setSession}
          onBack={() => setLobby(null)}
        />
      ) : (
        <HomeScreen onJoin={setSession} onCreate={(room, name) => setLobby({ room, name })} />
      )}
    </SafeAreaProvider>
  );
}

/* ---------------------------------- Home ---------------------------------- */

function HomeScreen({
  onJoin,
  onCreate,
}: {
  onJoin: (s: Session) => void;
  onCreate: (room: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Join an existing meeting by code (name is optional; defaults to Guest).
  const join = useCallback(async () => {
    const cleanRoom = room.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!cleanRoom) {
      setError('Enter a meeting code, or tap New meeting.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      onJoin(await fetchSession(cleanRoom, name));
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}\n\nIs the token server reachable at:\n${TOKEN_ENDPOINT}?`
          : 'Could not connect.',
      );
    } finally {
      setLoading(false);
    }
  }, [name, room, onJoin]);

  return (
    <SafeAreaView style={styles.homeRoot}>
      <StatusBar style="dark" />
      <View style={styles.homeInner}>
        <Text style={styles.title}>Beldex Meet</Text>
        <Text style={styles.subtitle}>Private video meetings</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            disabled={loading}
            onPress={() => onCreate(randomRoomName(), name)}
          >
            <Text style={styles.primaryBtnText}>New meeting</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR JOIN</Text>
            <View style={styles.line} />
          </View>

          <TextInput
            style={styles.input}
            value={room}
            onChangeText={(t) => {
              setRoom(t);
              setError('');
            }}
            placeholder="Meeting code"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            disabled={loading}
            onPress={join}
          >
            <Text style={styles.secondaryBtnText}>Join meeting</Text>
          </Pressable>

          {loading && <ActivityIndicator style={{ marginTop: 16 }} color="#4f46e5" />}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.footer}>Phase 1 · LiveKit · Beldex identity & payments next</Text>
      </View>
    </SafeAreaView>
  );
}

/* --------------------------------- Lobby ---------------------------------- */

// After "New meeting": show the code to share, set a name, then join.
function LobbyScreen({
  room,
  initialName,
  onJoin,
  onBack,
}: {
  room: string;
  initialName: string;
  onJoin: (s: Session) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const join = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      onJoin(await fetchSession(room, name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setLoading(false);
    }
  }, [room, name, onJoin]);

  const shareCode = useCallback(() => {
    Share.share({ message: `Join my Beldex Meet — meeting code: ${room}` }).catch(() => {});
  }, [room]);

  return (
    <SafeAreaView style={styles.homeRoot}>
      <StatusBar style="dark" />
      <View style={styles.homeInner}>
        <Text style={styles.title}>Meeting ready</Text>
        <Text style={styles.subtitle}>Share this code so another person can join</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Meeting code</Text>
          <View style={styles.codeBox}>
            <Text selectable style={styles.codeText}>
              {room}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={shareCode}
          >
            <Text style={styles.secondaryBtnText}>Share code</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>YOUR NAME</Text>
            <View style={styles.line} />
          </View>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            disabled={loading}
            onPress={join}
          >
            <Text style={styles.primaryBtnText}>Join meeting</Text>
          </Pressable>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>

          {loading && <ActivityIndicator style={{ marginTop: 16 }} color="#4f46e5" />}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------------------------------- Room ---------------------------------- */

function RoomScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [ready, setReady] = useState(false);
  const [permError, setPermError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          const ok =
            granted[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted' &&
            granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
          if (!ok && active) {
            setPermError('Camera and microphone permission are required to join.');
            return;
          }
        }
        await AudioSession.startAudioSession();
        if (active) setReady(true);
      } catch (e) {
        if (active) setPermError(e instanceof Error ? e.message : 'Audio setup failed.');
      }
    })();
    return () => {
      active = false;
      AudioSession.stopAudioSession();
    };
  }, []);

  if (permError) {
    return (
      <SafeAreaView style={styles.roomRoot}>
        <View style={styles.centerFill}>
          <Text style={styles.roomMsg}>{permError}</Text>
          <Pressable style={styles.leaveBtn} onPress={onLeave}>
            <Text style={styles.leaveBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.roomRoot}>
        <View style={styles.centerFill}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.roomMsg}>Connecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={session.serverUrl}
      token={session.token}
      connect
      audio
      video
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
      onDisconnected={onLeave}
    >
      <RoomView roomName={session.room} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function RoomView({ roomName, onLeave }: { roomName: string; onLeave: () => void }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const [chatOpen, setChatOpen] = useState(false);

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  // Show only other participants — hide the local user's own camera and screen-share tiles.
  const tracks = allTracks.filter((t) => !t.participant?.isLocal);

  const toggleMic = useCallback(
    () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
    [localParticipant, isMicrophoneEnabled],
  );
  const toggleCam = useCallback(
    () => localParticipant.setCameraEnabled(!isCameraEnabled),
    [localParticipant, isCameraEnabled],
  );
  const toggleScreen = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (e) {
      // User dismissed the capture prompt, or capture failed — ignore.
    }
  }, [localParticipant, isScreenShareEnabled]);
  const leave = useCallback(() => {
    room.disconnect();
    onLeave();
  }, [room, onLeave]);

  return (
    <SafeAreaView style={styles.roomRoot}>
      <StatusBar style="light" />
      <View style={styles.roomHeader}>
        <Text style={styles.roomTitle} numberOfLines={1}>
          {roomName}
        </Text>
        <Text style={styles.roomCount}>{participants.length} in call</Text>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item, i) => trackKey(item, i)}
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => <Tile track={item} />}
      />

      <View style={styles.controlBar}>
        <ControlButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label="Mic"
          active={isMicrophoneEnabled}
          onPress={toggleMic}
        />
        <ControlButton
          icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
          label="Camera"
          active={isCameraEnabled}
          onPress={toggleCam}
        />
        <ControlButton
          icon={isScreenShareEnabled ? 'stop-screen-share' : 'screen-share'}
          label="Share"
          accent={isScreenShareEnabled}
          onPress={toggleScreen}
        />
        <ControlButton icon="chat" label="Chat" onPress={() => setChatOpen(true)} />
        <ControlButton icon="call-end" label="Leave" danger onPress={leave} />
      </View>

      <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} />
    </SafeAreaView>
  );
}

function Tile({ track }: { track: TrackReferenceOrPlaceholder }) {
  const name = track.participant?.name || track.participant?.identity || 'Guest';
  // A screen-share track is always a real reference (withPlaceholder: false) and should
  // render regardless of the sharer's camera state. A camera tile renders only when that
  // participant's camera is on; otherwise it falls back to the avatar placeholder.
  const isScreenShare = isTrackReference(track) && track.source === Track.Source.ScreenShare;
  const showVideo = isTrackReference(track) && (isScreenShare || track.participant?.isCameraEnabled);
  return (
    <View style={styles.tile}>
      {showVideo ? (
        <VideoTrack
          trackRef={track}
          style={styles.video}
          objectFit={isScreenShare ? 'contain' : 'cover'}
        />
      ) : (
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
      )}
      <View style={styles.nameTag}>
        <Text style={styles.nameTagText} numberOfLines={1}>
          {name}
          {isScreenShare ? ' · screen' : ''}
          {track.participant?.isLocal ? ' (you)' : ''}
        </Text>
      </View>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  danger,
  accent,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
  onPress: () => void;
}) {
  const off = active === false;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.ctrl,
        off && styles.ctrlOff,
        accent && styles.ctrlAccent,
        danger && styles.ctrlDanger,
        pressed && styles.ctrlPressed,
      ]}
      onPress={onPress}
    >
      <MaterialIcons name={icon} size={20} color="#fff" />
      <Text style={styles.ctrlText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChatModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { chatMessages, send } = useChat();
  const [draft, setDraft] = useState('');
  const insets = useSafeAreaInsets();
  const [kb, setKb] = useState(0);

  useEffect(() => {
    // Lift by the gap from the screen bottom to the keyboard's top edge. Using the
    // absolute keyboard position (screenY) is frame-accurate under Android edge-to-edge,
    // where endCoordinates.height can undercount by the nav-bar height.
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const screenH = Dimensions.get('screen').height;
      setKb(Math.max(0, screenH - e.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const ordered = useMemo(() => [...chatMessages].reverse(), [chatMessages]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await send(text);
  }, [draft, send]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.chatBackdrop}>
        <View style={[styles.chatSheet, kb > 0 && { flex: 1, height: undefined, marginBottom: kb }]}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>Chat</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={24} color="#94a3b8" />
            </Pressable>
          </View>
          <FlatList
            data={ordered}
            inverted
            keyExtractor={(m) => String(m.timestamp) + (m.from?.identity ?? '')}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            renderItem={({ item }) => (
              <View style={styles.msg}>
                <Text style={styles.msgFrom}>{item.from?.name || item.from?.identity || 'Guest'}</Text>
                <Text style={styles.msgText}>{item.message}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet.</Text>}
          />
          <View style={[styles.chatInputRow, { paddingBottom: 12 + (kb > 0 ? 0 : insets.bottom) }]}>
            <TextInput
              style={styles.chatInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor="#9ca3af"
              onSubmitEditing={onSend}
              returnKeyType="send"
            />
            <Pressable style={styles.sendBtn} onPress={onSend}>
              <MaterialIcons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function trackKey(item: TrackReferenceOrPlaceholder, index: number) {
  const pid = item.participant?.identity ?? 'p';
  const src = isTrackReference(item) ? item.source : 'ph';
  return `${pid}-${src}-${index}`;
}

/* --------------------------------- Styles --------------------------------- */

const styles = StyleSheet.create({
  homeRoot: { flex: 1, backgroundColor: '#f8fafc' },
  homeInner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: { fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 14,
  },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  codeBox: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: '#f8fafc',
  },
  codeText: { fontSize: 22, fontWeight: '700', color: '#4f46e5', letterSpacing: 1 },
  backBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  backBtnText: { color: '#64748b', fontWeight: '600', fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { fontSize: 11, color: '#94a3b8', fontWeight: '600', letterSpacing: 1 },
  error: { color: '#dc2626', marginTop: 14, fontSize: 13, lineHeight: 18 },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 24 },

  roomRoot: { flex: 1, backgroundColor: '#0b0f17' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  roomMsg: { color: '#e2e8f0', fontSize: 15, textAlign: 'center' },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roomTitle: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  roomCount: { color: '#94a3b8', fontSize: 13 },
  grid: { padding: 8, gap: 8 },
  tile: {
    flex: 1,
    aspectRatio: 3 / 4,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  video: { flex: 1 },
  avatarWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  nameTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: '90%',
  },
  nameTagText: { color: '#fff', fontSize: 12 },
  controlBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'center',
    backgroundColor: '#0b0f17',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  ctrl: {
    flex: 1,
    maxWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    gap: 4,
  },
  ctrlOff: { backgroundColor: '#b91c1c' },
  ctrlAccent: { backgroundColor: '#2563eb' },
  ctrlDanger: { backgroundColor: '#dc2626' },
  ctrlPressed: { opacity: 0.7 },
  ctrlText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  leaveBtn: { backgroundColor: '#dc2626', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  leaveBtnText: { color: '#fff', fontWeight: '600' },

  chatBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  chatSheet: { height: '85%', backgroundColor: '#0f172a', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  chatTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatClose: { color: '#818cf8', fontSize: 15, fontWeight: '600' },
  chatEmpty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
  msg: { backgroundColor: '#1e293b', borderRadius: 10, padding: 10 },
  msgFrom: { color: '#818cf8', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  msgText: { color: '#e2e8f0', fontSize: 14 },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#2563eb',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
