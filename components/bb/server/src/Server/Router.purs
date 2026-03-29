module Server.Router
  ( PendingMap
  , initPendingMap
  , sendToExtension
  , handleIncomingMessage
  , rejectAllPending
  , isExtensionConnected
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, makeAff, nonCanceler)
import Effect.Exception (Error, error) as Ex
import Effect.Ref (Ref)
import Effect.Ref as Ref
import Foreign (Foreign)

import Server.WebSocket (Server, broadcast)

type PendingMap = Ref Foreign

initPendingMap :: Effect PendingMap
initPendingMap = ffiEmptyMap >>= Ref.new

sendToExtension :: Server -> PendingMap -> String -> Foreign -> Aff Foreign
sendToExtension server pendingMap action payload = makeAff \ebc -> do
  id <- generateId
  timer <- setTimeout_ 30000 \_ -> do
    pendingMapVal <- Ref.read pendingMap
    ffiMapDelete pendingMapVal id
    ebc $ Left $ Ex.error $ "Timeout waiting for extension response (action: " <> action <> ")"
  pendingMapVal <- Ref.read pendingMap
  let pendingEntry = ffiMakePendingEntry ebc timer
  ffiMapSet pendingMapVal id pendingEntry
  msgJson <- buildRequestJson id action payload
  broadcast server msgJson
  pure nonCanceler

handleIncomingMessage :: PendingMap -> String -> Effect (Maybe Foreign)
handleIncomingMessage pendingMap rawMessage = do
  msg <- jsonParse rawMessage
  msgType <- foreignToString =<< foreignGetProperty "type" msg
  case msgType of
    "response" -> do
      msgId <- foreignToString =<< foreignGetProperty "id" msg
      msgPayload <- foreignGetProperty "payload" msg
      pendingMapVal <- Ref.read pendingMap
      mEntry <- ffiMapGet pendingMapVal msgId
      case mEntry of
        Just entry -> do
          clearTimeout_ =<< ffiGetTimer entry
          ffiMapDelete pendingMapVal msgId
          ffiResolve entry msgPayload
          pure $ Just msgPayload
        Nothing ->
          pure Nothing
    _ ->
      pure Nothing

rejectAllPending :: PendingMap -> String -> Effect Unit
rejectAllPending pendingMap errorMsg = do
  pendingMapVal <- Ref.read pendingMap
  entries <- ffiMapValues pendingMapVal
  ffiForEach entries \entry -> do
    timer <- ffiGetTimer entry
    clearTimeout_ timer
    ffiReject entry =<< ffiError errorMsg
  ffiMapClear pendingMapVal

foreign import ffiEmptyMap :: Effect Foreign
foreign import ffiMapSet :: Foreign -> String -> Foreign -> Effect Unit
foreign import ffiMapGet :: Foreign -> String -> Effect (Maybe Foreign)
foreign import ffiMapDelete :: Foreign -> String -> Effect Unit
foreign import ffiMapValues :: Foreign -> Effect (Array Foreign)
foreign import ffiMapClear :: Foreign -> Effect Unit
foreign import ffiMakePendingEntry :: (Either Ex.Error Foreign -> Effect Unit) -> Foreign -> Foreign
foreign import ffiGetTimer :: Foreign -> Effect Foreign
foreign import ffiResolve :: Foreign -> Foreign -> Effect Unit
foreign import ffiReject :: Foreign -> Foreign -> Effect Unit
foreign import generateId :: Effect String
foreign import setTimeout_ :: Int -> (Foreign -> Effect Unit) -> Effect Foreign
foreign import clearTimeout_ :: Foreign -> Effect Unit
foreign import jsonParse :: String -> Effect Foreign
foreign import foreignGetProperty :: String -> Foreign -> Effect Foreign
foreign import foreignToString :: Foreign -> Effect String
foreign import buildRequestJson :: String -> String -> Foreign -> Effect String
foreign import ffiError :: String -> Effect Foreign
foreign import ffiForEach :: forall a. Array a -> (a -> Effect Unit) -> Effect Unit
foreign import isExtensionConnected :: Server -> Effect Boolean
