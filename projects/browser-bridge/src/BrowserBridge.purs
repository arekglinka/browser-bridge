-- | BrowserBridge — public API re-export module.
-- |
-- | Import this module to get all public types and functions from the
-- | browser-bridge component library.
-- |
-- | Note: TokenParsing and Interceptor both export detectPlatform, so
-- | they are not re-exported here. Import them directly when needed:
-- |   import TokenParsing.FFI
-- |   import Interceptor.Main
module BrowserBridge
  ( module Protocol
  , module Server
  , module ExtensionClient
  , module Serialization
  ) where

import Protocol
import Server
import ExtensionClient
import Serialization
