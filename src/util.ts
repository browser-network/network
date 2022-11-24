export const exhaustive = (
  _: never,
  errorStr = 'Something unexpected happened and we got errantly to a default case in a switch'
): never => {
  throw new Error(errorStr)
}

export const getIpFromRTCSDP = (sdp: string): string | null => {
  const ipRegex = /(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3})/g
  const ips = sdp.match(ipRegex)
  if (ips && ips.length > 0) {
    return ips[0]
  }
  return null
}
