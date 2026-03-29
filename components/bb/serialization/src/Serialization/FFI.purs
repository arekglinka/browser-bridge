module Serialization.FFI
  ( initSerialization
  , serializeMessage
  , deserializeMessage
  ) where

import Control.Promise (Promise, toAffE)
import Data.Unit (Unit)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

foreign import _wasmInit :: Effect (Promise Unit)

initSerialization :: Aff Unit
initSerialization = toAffE _wasmInit

foreign import serializeMessage :: String -> String -> Effect Foreign

foreign import deserializeMessage :: Foreign -> Effect String
