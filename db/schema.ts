import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const analyticsEvents = sqliteTable('analytics_events', {
  eventId: text('event_id').primaryKey(),
  day: text('day').notNull(),
  hour: integer('hour').notNull(),
  visitorKey: text('visitor_key').notNull(),
  receivedAt: integer('received_at').notNull()
}, table => [index('analytics_day_hour_visitor_idx').on(table.day,table.hour,table.visitorKey)]);
export const analyticsState = sqliteTable('analytics_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const inquiries = sqliteTable('inquiries', {
  id: text('id').primaryKey(),
  requestKey: text('request_key').notNull(),
  tokenHash: text('token_hash').notNull(),
  receipt: text('receipt').notNull(),
  service: text('service').notNull(),
  space: text('space').notNull(),
  district: text('district').notNull(),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  addressDetail: text('address_detail').notNull().default(''),
  details: text('details').notNull().default(''),
  status: text('status').notNull().default('draft'),
  consentVersion: text('consent_version').notNull(),
  createdAt: integer('created_at').notNull(),
  submittedAt: integer('submitted_at'),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  talkReadAt: integer('talk_read_at')
}, table => [uniqueIndex('inquiries_request_key_idx').on(table.requestKey), uniqueIndex('inquiries_receipt_idx').on(table.receipt), index('inquiries_status_created_idx').on(table.status, table.createdAt), index('inquiries_expiry_idx').on(table.expiresAt)]);

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => inquiries.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull()
}, table => [index('photos_inquiry_kind_idx').on(table.inquiryId, table.kind)]);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull()
}, table => [index('rate_limits_expiry_idx').on(table.expiresAt)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const smsOutbox = sqliteTable('sms_outbox', {
  inquiryId: text('inquiry_id').primaryKey().references(() => inquiries.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  providerId: text('provider_id'),
  errorCode: text('error_code'),
  updatedAt: integer('updated_at').notNull()
}, table => [index('sms_outbox_status_idx').on(table.status, table.updatedAt)]);

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  encryptedEndpoint: text('encrypted_endpoint').notNull(),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  lastStatus: text('last_status'),
  lastAt: integer('last_at'),
  lastHttpStatus: integer('last_http_status'),
  lastError: text('last_error')
}, table => [index('push_subscriptions_user_idx').on(table.userId)]);

export const pushOutbox = sqliteTable('push_outbox', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => inquiries.id, {onDelete:'cascade'}),
  subscriptionId: text('subscription_id').notNull().references(() => pushSubscriptions.id, {onDelete:'cascade'}),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  updatedAt: integer('updated_at').notNull()
}, table => [index('push_outbox_status_idx').on(table.status, table.updatedAt)]);

// Consultation chat attached to an inquiry; removed together with it.
export const talkMessages = sqliteTable('talk_messages', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => inquiries.id, {onDelete:'cascade'}),
  sender: text('sender').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull()
}, table => [index('talk_messages_inquiry_idx').on(table.inquiryId, table.createdAt)]);

// A customer's browser that asked to be alerted when the owner answers in the chat.
export const talkSubscriptions = sqliteTable('talk_subscriptions', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => inquiries.id, {onDelete:'cascade'}),
  endpointId: text('endpoint_id').notNull(),
  encryptedEndpoint: text('encrypted_endpoint').notNull(),
  createdAt: integer('created_at').notNull(),
  lastStatus: text('last_status'),
  lastAt: integer('last_at')
}, table => [index('talk_subscriptions_inquiry_idx').on(table.inquiryId)]);
