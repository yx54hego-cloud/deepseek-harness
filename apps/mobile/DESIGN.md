# DeepSeek Harness Mobile Design

## Intent

The app is a calm pocket window into a conversation already running elsewhere. It preserves the restrained DeepSeek Harness product language and uses platform-native interaction patterns instead of imitating the desktop shell.

## Color

The palette reuses the committed Harness tokens from `packages/client/ui-theme`: pure white or neutral-bluish dark surfaces, near-black or near-white text, DeepSeek blue for informative actions, green for connected state, amber for reconnecting, and red for failures. Conversation bubbles use the existing DeepSeek 50/200 family in light appearance and neutral raised surfaces in dark appearance.

## Typography

Use the platform system family throughout. Body copy is 16-17 sp/pt with system scaling enabled; compact metadata is never below 12 sp/pt. Messages use a relaxed 1.45 line height and preserve selectable text.

## Layout

Every screen respects safe-area and keyboard insets. After pairing, the conversation is the persistent base surface: a 72-point brand bar, a flexible message list, and one bottom composer capsule. A modal left drawer covers 72 percent of compact phones up to 400 points, while a scrim closes it without replacing the conversation. Drawer sections use full-width rows and indentation instead of cards. Layout spacing follows a 4-point scale, and interactive targets are at least 48 points on Android. Visible icon surfaces stay smaller than their touch targets. The composer remains reachable above the keyboard and grows to four text lines before scrolling.

## Components

- Connection pill: icon plus text for connected, connecting, offline, or failed.
- Brand bar: the approved DeepSeek Harness lockup, navigation menu, session-creation action, and paired-host actions.
- Navigation drawer: working-directory groups, five recent Sessions, connection state, workspace search and organization, independent expand/collapse, and paired-host settings. Workspace creation remains disabled because it belongs to the Web surface; voice remains reserved.
- Pairing intake: primary QR scan action, secondary paste field, and one short security explanation.
- Session row: one-line title, conversation icon, selected fill, and running indicator inside the drawer.
- Message bubble: user messages use a quiet raised fill; assistant messages pair a brand avatar with a bordered reading surface.
- Composer: one capsule containing reserved attachment, multiline input, model label, reserved microphone, and one 48-point text-send target; the empty target displays the approved blue waveform artwork, and text send is disabled while empty, disconnected, or submitting.

The brand lockup, whale, navigation glyphs, workspace glyphs, microphone, and voice artwork are transparent raster assets extracted from the approved mobile composition. Product chrome does not substitute glyphs from a generic icon font.

## Motion

Use only native screen transitions, keyboard motion, press feedback, and a subtle state crossfade. Reduced-motion settings remove nonessential transitions.

## States

Loading uses row skeletons where practical. Empty lists explain that a conversation must first exist in the desktop Harness. Connection errors retain the pairing and provide Retry or Forget Host. Send failures preserve the draft and present an inline error.
