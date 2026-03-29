-- | Message type definitions matching the browser-bridge protobuf schema.
-- |
-- | These types model the wire protocol between the desktop server and the
-- | browser extension. All types are pure data — no Effect or FFI.
-- |
-- | See proto/messages.proto for the canonical protobuf definitions.
module Protocol.Types
  ( BrowserRequest(..)
  , ExtensionMessage(..)
  , ResponseMessage(..)
  , KeepaliveMessage(..)
  , HotReloadMessage(..)
  , NewEmailMessage(..)
  , EmailData(..)
  , TokenMessage(..)
  , Timestamp(..)
  , unTimestamp
  , mkTimestamp
  ) where

import Prelude

import Data.Maybe (Maybe)
import Data.Newtype (class Newtype, wrap, unwrap)

-- ── Newtype wrappers ───────────────────────────────────────────────

-- | Unix-epoch timestamp in milliseconds (uint64 in proto → Int in PS).
newtype Timestamp = Timestamp Int

derive instance newtypeTimestamp :: Newtype Timestamp _
derive newtype instance eqTimestamp :: Eq Timestamp
derive newtype instance showTimestamp :: Show Timestamp

unTimestamp :: Timestamp -> Int
unTimestamp = unwrap

mkTimestamp :: Int -> Timestamp
mkTimestamp = wrap

-- ── Browser Request (server → extension) ───────────────────────────

-- | A request from the desktop server to the browser extension.
-- | Corresponds to proto `BrowserRequest`.
newtype BrowserRequest = BrowserRequest
  { id      :: String
  , action  :: String
  , payload :: Maybe String  -- bytes in proto, encoded as UTF-8 string
  }

derive instance newtypeBrowserRequest :: Newtype BrowserRequest _
derive newtype instance eqBrowserRequest :: Eq BrowserRequest
derive newtype instance showBrowserRequest :: Show BrowserRequest

-- ── Extension Message (extension → server) ─────────────────────────

-- | Union type for all messages sent from the extension to the server.
-- | Corresponds to proto `ExtensionMessage` with oneof variant.
data ExtensionMessage
  = Response  ResponseMessage
  | Keepalive KeepaliveMessage
  | HotReload HotReloadMessage
  | NewEmail  NewEmailMessage
  | Unknown   String  -- fallback for forward-compat

derive instance eqExtensionMessage :: Eq ExtensionMessage

instance showExtensionMessage :: Show ExtensionMessage where
  show = case _ of
    Response  r  -> "(Response " <> show r <> ")"
    Keepalive k  -> "(Keepalive " <> show k <> ")"
    HotReload h  -> "(HotReload " <> show h <> ")"
    NewEmail   n -> "(NewEmail " <> show n <> ")"
    Unknown   s  -> "(Unknown " <> show s <> ")"

-- ── Message variants ───────────────────────────────────────────────

-- | Response to a BrowserRequest.
-- | Corresponds to proto `ResponseMessage`.
newtype ResponseMessage = ResponseMessage
  { id      :: String
  , payload :: Maybe String  -- bytes in proto, encoded as UTF-8 string
  }

derive instance newtypeResponseMessage :: Newtype ResponseMessage _
derive newtype instance eqResponseMessage :: Eq ResponseMessage
derive newtype instance showResponseMessage :: Show ResponseMessage

-- | Keepalive signal — presence in the oneof is the signal (empty message).
-- | Corresponds to proto `KeepaliveMessage`.
data KeepaliveMessage = KeepaliveMessage

derive instance eqKeepaliveMessage :: Eq KeepaliveMessage

instance showKeepaliveMessage :: Show KeepaliveMessage where
  show _ = "KeepaliveMessage"

-- | Hot reload notification with changed file paths.
-- | Corresponds to proto `HotReloadMessage`.
newtype HotReloadMessage = HotReloadMessage
  { files :: Array String  -- repeated in proto
  }

derive instance newtypeHotReloadMessage :: Newtype HotReloadMessage _
derive newtype instance eqHotReloadMessage :: Eq HotReloadMessage
derive newtype instance showHotReloadMessage :: Show HotReloadMessage

-- | New email notification from content script.
-- | Corresponds to proto `NewEmailMessage`.
newtype NewEmailMessage = NewEmailMessage
  { email :: Maybe EmailData  -- optional in proto (message field)
  }

derive instance newtypeNewEmailMessage :: Newtype NewEmailMessage _
derive newtype instance eqNewEmailMessage :: Eq NewEmailMessage
derive newtype instance showNewEmailMessage :: Show NewEmailMessage

-- ── Email data ─────────────────────────────────────────────────────

-- | Extracted email metadata from a webmail page.
-- | Corresponds to proto `EmailData`.
-- | All fields are optional (proto3 optional = Maybe).
newtype EmailData = EmailData
  { subject     :: Maybe String
  , sender      :: Maybe String
  , bodyPreview :: Maybe String
  }

derive instance newtypeEmailData :: Newtype EmailData _
derive newtype instance eqEmailData :: Eq EmailData
derive newtype instance showEmailData :: Show EmailData

-- ── Token data ─────────────────────────────────────────────────────

-- | Token extracted from a browser session.
-- | Corresponds to proto `TokenMessage`.
newtype TokenMessage = TokenMessage
  { platform   :: String
  , tokenType  :: String       -- "token_type" in proto → tokenType (PS keyword)
  , token      :: String
  , url        :: Maybe String
  , timestamp  :: Timestamp     -- uint64 in proto → newtype Int
  }

derive instance newtypeTokenMessage :: Newtype TokenMessage _
derive newtype instance eqTokenMessage :: Eq TokenMessage
derive newtype instance showTokenMessage :: Show TokenMessage
