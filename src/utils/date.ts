/**
 * Date Utilities
 *
 * Uses dayjs for relative time formatting and calendar display.
 * Core operations: addDays, daysBetween, isSameDay, customFromNow
 *
 * customFromNow: Shows "Today"/"Tomorrow"/weekday names for nearby dates,
 * falls back to relative time (e.g., "2 months ago") for distant dates.
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import calendar from 'dayjs/plugin/calendar';
dayjs.extend(calendar);

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const subtractDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

export const normalizeToDay = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const daysBetween = (d1: Date, d2: Date) => {
  const startOfD1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const startOfD2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs((startOfD1.getTime() - startOfD2.getTime()) / oneDay));
};

const fromNow = (date) => {
  return dayjs(date).fromNow();
};

export const customFromNow = (date) => {
  const daysDiff = daysBetween(new Date(), date);
  if (daysDiff > -7 && daysDiff < 7) {
    return dayjs(date).calendar(null, {
      sameDay: '[Today]',
      nextDay: '[Tomorrow]',
      nextWeek: 'dddd',
      lastDay: '[Yesterday]',
      lastWeek: '[Last] dddd',
    });
  } else {
    return fromNow(date);
  }
};

export const toLocalDateString = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isSameDay = (d1: Date | undefined, d2: Date | undefined) => {
  if (!isDate(d1) || !isDate(d2)) return false;
  return (d1 as Date).toDateString() === (d2 as Date).toDateString();
};

export const isDate = (date: unknown) =>
  date instanceof Date && !Number.isNaN(date.getTime());
