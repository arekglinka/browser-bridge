module Cli.Main where

import Prelude
import Effect (Effect)
import Effect.Console (log)
import Server (createServer, onConnection, onMessage, onDisconnection)

main :: Effect Unit
main = do
  let port = 3456
  log $ "Starting browser-bridge server on port " <> show port
  server <- createServer port
  log "Server created"
  onConnection server \_conn -> do
    log "Extension connected!"
  onMessage server \msg -> do
    log $ "Received: " <> msg
  onDisconnection server $ do
    log "Extension disconnected"
  log $ "Listening on ws://localhost:" <> show port
