// Source
import type { SourceType } from './source.js'

const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
  'twitch.tv',
]

export const detectSourceType = ( url: string ): SourceType => {
  let hostname: string

  try {
    hostname = new URL( url ).hostname
  } catch{
    return 'article'
  }

  const host = hostname.toLowerCase().replace( /^(www|m)\./, '' )
  const isVideo = VIDEO_HOSTS.some( ( video ) => host === video || host.endsWith( `.${ video }` ) )

  return isVideo ? 'video' : 'article'
}
