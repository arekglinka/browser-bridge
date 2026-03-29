module TokenParsing.FFI
  ( initTokenParsing
  , extractBearerToken
  , extractSapisidhash
  , extractXoxcToken
  , detectPlatform
  ) where

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Unit (Unit)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import _wasmInit :: Effect (Promise Unit)

initTokenParsing :: Aff Unit
initTokenParsing = toAffE _wasmInit

foreign import extractBearerToken :: String -> Effect (Maybe String)

foreign import extractSapisidhash :: String -> Effect (Maybe String)

foreign import extractXoxcToken :: String -> Effect (Maybe String)

foreign import detectPlatform :: String -> Effect String
