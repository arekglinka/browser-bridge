module ExtensionClient.TokenStorage
  ( TokenEntry(..)
  , storeToken
  , storeTokenImpl
  , getToken
  , getTokenImpl
  , getAllTokens
  , getAllTokensImpl
  , removeToken
  , removeTokenImpl
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

type TokenEntry =
  { platform :: String
  , token :: String
  , tokenType :: String
  , capturedAt :: String
  , url :: Maybe String
  , expiresAt :: Maybe String
  }

foreign import storeTokenImpl :: Foreign -> Effect (Promise Unit)
storeToken :: TokenEntry -> Aff Unit
storeToken entry = toAffE (storeTokenImpl (entryToForeign entry))

foreign import getTokenImpl :: String -> Effect (Promise Foreign)
getToken :: String -> Aff (Maybe Foreign)
getToken platform = do
  result <- toAffE (getTokenImpl platform)
  pure if isNull result then Nothing else Just result

foreign import getAllTokensImpl :: Effect (Promise Foreign)
getAllTokens :: Aff Foreign
getAllTokens = toAffE getAllTokensImpl

foreign import removeTokenImpl :: String -> Effect (Promise Unit)
removeToken :: String -> Aff Unit
removeToken = toAffE <<< removeTokenImpl

foreign import isNull :: Foreign -> Boolean

foreign import entryToForeign :: TokenEntry -> Foreign
