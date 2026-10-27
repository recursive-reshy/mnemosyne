// Config
import { config } from '../config.js'

interface DayOptions {
  timeZone: string
  startHour: number
}

interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// Local time in a zone from Intl parts, so the container's TZ doesn't matter.
export const wallTime = ( instant: number, timeZone: string ): WallTime => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat( 'en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    } ).formatToParts( instant ).map( ( part ) => [ part.type, Number( part.value ) ] ),
  )

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

const offsetAt = ( instant: number, timeZone: string ): number => {
  const { year, month, day, hour, minute, second } = wallTime( instant, timeZone )

  const wall = Date.UTC( year, month - 1, day, hour, minute, second )

  return wall - Math.floor( instant / 1000 ) * 1000
}

// The instant a zone's clock shows `hour`:00 on the given date. An hour that happens twice
// gives its first occurrence; an hour the clocks skip gives the moment they jump.
export const instantAt = (
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): number => {
  const guess = Date.UTC( year, month - 1, day, hour )
  const first = guess - offsetAt( guess, timeZone )
  const second = guess - offsetAt( first, timeZone )

  return wallTime( second, timeZone ).hour === hour ? second : Math.max( first, second )
}

// The most recent `startHour`:00 in the zone at or before `now`
export const dayStart = (
  now: Date,
  { timeZone, startHour }: DayOptions = {
    timeZone: config.timeZone,
    startHour: config.melete.dayStartHour,
  },
): Date => {
  const { year, month, day } = wallTime( now.getTime(), timeZone )
  const today = instantAt( year, month, day, startHour, timeZone )

  if( today <= now.getTime() ) {
    return new Date( today )
  }

  const yesterday = new Date( Date.UTC( year, month - 1, day - 1 ) )

  return new Date( instantAt(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth() + 1,
    yesterday.getUTCDate(),
    startHour,
    timeZone,
  ) )
}
