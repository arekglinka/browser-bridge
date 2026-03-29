-- | Chrome Extension API FFI bindings for MV3.
-- |
-- | Provides typed wrappers for chrome.runtime, chrome.scripting,
-- | chrome.cookies, and standard WebSocket (available in MV3 service workers).
-- | Promise-returning APIs use Control.Promise.toAffE.
module ExtensionClient.Chrome
  ( Client(..)
  , WebSocketClient(..)
  , connectWebSocket
  , wsSend
  , wsIsOpen
  , wsOnMessage
  , wsOnClose
  , wsClose
  , runtimeSendMessage
  , runtimeSendMessageImpl
  , runtimeOnMessageAddListener
  , scriptingExecuteScript
  , scriptingExecuteScriptImpl
  , cookiesGet
  , cookiesGetImpl
  , runtimeGetURL
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

-- ── Opaque types ──────────────────────────────────────────────────

foreign import data Client :: Type

foreign import data WebSocketClient :: Type

-- ── WebSocket (standard API in MV3 service workers) ───────────────

foreign import connectWebSocket :: String -> Effect WebSocketClient

foreign import wsSend :: WebSocketClient -> String -> Effect Unit

foreign import wsIsOpen :: WebSocketClient -> Effect Boolean

foreign import wsOnMessage :: WebSocketClient -> (String -> Effect Unit) -> Effect Unit

foreign import wsOnClose :: WebSocketClient -> (Int -> Effect Unit) -> Effect Unit

foreign import wsClose :: WebSocketClient -> Effect Unit

-- ── chrome.runtime ────────────────────────────────────────────────

foreign import runtimeSendMessageImpl :: Foreign -> Effect (Promise Foreign)
runtimeSendMessage :: Foreign -> Aff Foreign
runtimeSendMessage = toAffE <<< runtimeSendMessageImpl

foreign import runtimeOnMessageAddListener
  :: (Foreign -> Foreign -> (Foreign -> Effect Unit) -> Effect Boolean)
  -> Effect Unit

foreign import runtimeGetURL :: String -> Effect String

-- ── chrome.scripting ──────────────────────────────────────────────

foreign import scriptingExecuteScriptImpl :: Foreign -> Effect (Promise (Array Foreign))
scriptingExecuteScript :: Foreign -> Aff (Array Foreign)
scriptingExecuteScript = toAffE <<< scriptingExecuteScriptImpl

-- ── chrome.cookies ────────────────────────────────────────────────

foreign import cookiesGetImpl :: Foreign -> Effect (Promise (Nullable Foreign))
cookiesGet :: Foreign -> Aff (Nullable Foreign)
cookiesGet = toAffE <<< cookiesGetImpl
