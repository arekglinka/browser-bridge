module Server.HotReload
  ( watchDist
  ) where

import Prelude

import Effect (Effect)

watchDist :: String -> (Array String -> Effect Unit) -> Effect (Effect Unit)
watchDist = ffiWatchDist

foreign import ffiWatchDist :: String -> (Array String -> Effect Unit) -> Effect (Effect Unit)
