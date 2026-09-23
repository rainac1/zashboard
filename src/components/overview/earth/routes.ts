import { connectionAccessor } from '@/assembly/connections'
import type { Connection } from '@/types'
import * as ipaddr from 'ipaddr.js'
import type { EarthHostTraffic, EarthLocation, EarthLocationHint, EarthRoute } from './types'

type LocatedCoordinates = { latitude: number; longitude: number }

interface RouteCandidate {
  destinationIP: string | null
  resolutionHost: string
  upload: number
  download: number
  host: string
  downloaded: number
  direct: boolean
}

const normalizeIP = (value: string) => {
  try {
    return ipaddr.parse(value).toNormalizedString()
  } catch {
    return null
  }
}

const destinationIP = (rawValue: string) => {
  const value = rawValue.trim()

  if (!value) return null

  const bareIP = normalizeIP(value)

  if (bareIP) return bareIP

  if (value.startsWith('[')) {
    const closingBracket = value.indexOf(']')

    if (closingBracket > 1) return normalizeIP(value.slice(1, closingBracket))
  }

  const lastColon = value.lastIndexOf(':')

  if (lastColon > 0 && /^\d+$/.test(value.slice(lastColon + 1))) {
    return normalizeIP(value.slice(0, lastColon))
  }

  return null
}

const extractCandidates = (connections: readonly Connection[]): RouteCandidate[] => {
  const accessor = connectionAccessor()
  const candidates: RouteCandidate[] = []

  for (const connection of connections) {
    const destination = destinationIP(accessor.destination(connection))
    const rawHost = accessor.hostname(connection).trim().replace(/\.$/, '')

    if (!destination && !rawHost) continue

    candidates.push({
      destinationIP: destination,
      resolutionHost: rawHost.toLowerCase(),
      upload: Math.max(0, connection.uploadSpeed),
      download: Math.max(0, connection.downloadSpeed),
      host: rawHost || destination || '',
      downloaded: Math.max(0, accessor.download(connection)),
      direct: accessor.isDirect(connection),
    })
  }

  return candidates
}

const coordinateKey = ({ latitude, longitude }: EarthLocation) =>
  `${latitude.toFixed(4)},${longitude.toFixed(4)}`

const mergeTopHosts = (...groups: EarthHostTraffic[][]) =>
  groups
    .flat()
    .sort((left, right) => right.downloaded - left.downloaded)
    .slice(0, 5)

const hasValidCoordinates = (
  location: Pick<EarthLocationHint, 'latitude' | 'longitude'> | EarthLocation | null,
): location is (EarthLocationHint | EarthLocation) & LocatedCoordinates =>
  location !== null &&
  location.latitude !== null &&
  location.longitude !== null &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude) &&
  location.latitude >= -90 &&
  location.latitude <= 90 &&
  location.longitude >= -180 &&
  location.longitude <= 180

const resolveOrigin = (
  ip: string,
  local: EarthLocation | null | undefined,
  preferred?: EarthLocationHint | null,
): EarthLocation | null => {
  let latitude: number
  let longitude: number

  if (preferred && hasValidCoordinates(preferred)) {
    latitude = preferred.latitude
    longitude = preferred.longitude
  } else if (local && hasValidCoordinates(local)) {
    latitude = local.latitude
    longitude = local.longitude
  } else {
    return null
  }

  return {
    ip,
    latitude,
    longitude,
    city: preferred?.city.trim() || local?.city || '',
    country: local?.country || preferred?.country.trim() || '',
  }
}

export const buildEarthRoutes = async (
  connections: readonly Connection[],
  originIP: string,
  locale: string,
  lookup: (ips: string[], locale: string) => Promise<Record<string, EarthLocation | null>>,
  preferredOrigin?: EarthLocationHint | null,
  resolveDestinationIPs?: (hostnames: string[]) => Promise<Record<string, string | null>>,
) => {
  const normalizedOrigin = normalizeIP(originIP)

  if (!normalizedOrigin) return { routes: [] as EarthRoute[], origin: null }

  const candidates = extractCandidates(connections)
  const unresolvedHosts = [
    ...new Set(
      candidates
        .filter((candidate) => !candidate.destinationIP)
        .map((candidate) => candidate.resolutionHost),
    ),
  ]
  const resolvedIPs =
    resolveDestinationIPs && unresolvedHosts.length > 0
      ? await resolveDestinationIPs(unresolvedHosts)
      : {}

  for (const candidate of candidates) {
    if (!candidate.destinationIP) {
      candidate.destinationIP = normalizeIP(resolvedIPs[candidate.resolutionHost] ?? '')
    }
  }

  const resolvedCandidates = candidates.filter(
    (candidate): candidate is RouteCandidate & { destinationIP: string } =>
      candidate.destinationIP !== null,
  )
  const ips = new Set<string>([normalizedOrigin])

  for (const candidate of resolvedCandidates) ips.add(candidate.destinationIP)

  const locations = await lookup([...ips], locale)
  const origin = resolveOrigin(normalizedOrigin, locations[normalizedOrigin], preferredOrigin)

  if (!origin) return { routes: [] as EarthRoute[], origin: null }

  const aggregated = new Map<string, EarthRoute>()

  for (const candidate of resolvedCandidates) {
    const destination = locations[candidate.destinationIP]

    if (!destination) continue

    const path: EarthRoute['path'] = [
      { ...origin, role: 'origin' },
      { ...destination, role: 'destination' },
    ]
    const key = path.map((point) => `${point.role}:${coordinateKey(point)}`).join('>')
    const existing = aggregated.get(key)

    if (existing) {
      existing.direct &&= candidate.direct
      existing.connections += 1
      existing.upload += candidate.upload
      existing.download += candidate.download
      existing.topHosts = mergeTopHosts(
        existing.topHosts,
        candidate.host ? [{ host: candidate.host, downloaded: candidate.downloaded }] : [],
      )
    } else {
      aggregated.set(key, {
        key,
        path,
        direct: candidate.direct,
        connections: 1,
        upload: candidate.upload,
        download: candidate.download,
        topHosts: candidate.host
          ? [{ host: candidate.host, downloaded: candidate.downloaded }]
          : [],
      })
    }
  }

  return { routes: [...aggregated.values()], origin }
}
