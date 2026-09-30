const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDate = (iso: string): string => dateFormatter.format(new Date(iso));
export const formatDateTime = (iso: string): string => dateTimeFormatter.format(new Date(iso));
