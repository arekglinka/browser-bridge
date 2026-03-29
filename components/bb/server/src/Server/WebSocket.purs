module Server.WebSocket
  ( Server
  , Connection
  , ConnectionConfig
  , createServer
  , onConnection
  , onDisconnection
  , onMessage
  , send
  , close
  , closeServer
  , broadcast
  ) where

import Prelude

import Effect (Effect)

foreign import data Server :: Type

foreign import data Connection :: Type

type ConnectionConfig =
  { connection :: Connection
  , send       :: String -> Effect Unit
  , close      :: Effect Unit
  }

foreign import createServer :: Int -> Effect Server

foreign import onConnection :: Server -> (ConnectionConfig -> Effect Unit) -> Effect Unit

foreign import onDisconnection :: Server -> Effect Unit -> Effect Unit

foreign import onMessage :: Server -> (String -> Effect Unit) -> Effect Unit

foreign import send :: Connection -> String -> Effect Unit

foreign import close :: Connection -> Effect Unit

foreign import closeServer :: Server -> Effect Unit

foreign import broadcast :: Server -> String -> Effect Unit
