import {
  pgTable,
  pgSchema,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  time,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Auth schema (Supabase auth.users reference)
// ---------------------------------------------------------------------------
const authSchema = pgSchema('auth')
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'property_manager',
  'staff',
])

export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'reviewed',
])

export const surveyTypeEnum = pgEnum('survey_type', ['internal', 'guest'])

export const issueStatusEnum = pgEnum('issue_status', [
  'open',
  'investigating',
  'closed',
])

export const guestProfileStatusEnum = pgEnum('guest_profile_status', [
  'pending_questionnaire',
  'pending_approval',
  'pending_checkin',
  'checked_in',
  'cancelled',
])

export const preArrivalQuestionTypeEnum = pgEnum('pre_arrival_question_type', [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'date',
  'time',
  'yes_no',
  'file',
])

export const sopFrequencyEnum = pgEnum('sop_frequency', [
  'daily',
  'weekly',
  'monthly',
  'yearly',
])

export const sopCompletionStatusEnum = pgEnum('sop_completion_status', [
  'pending',
  'completed',
])

export const utilityTypeEnum = pgEnum('utility_type', ['water', 'electricity'])

export const readingSlotStatusEnum = pgEnum('reading_slot_status', ['manual', 'autofilled', 'edited'])

export const assetCategoryEnum = pgEnum('asset_category', [
  'ffe', 'machinery', 'kitchen', 'it', 'vehicles',
])
export const assetStatusEnum = pgEnum('asset_status', [
  'active', 'in_repair', 'missing', 'disposed',
])
export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'pending', 'resolved',
])

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const organizationsRelations = relations(organizations, ({ many }) => ({
  properties: many(properties),
  profiles: many(profiles),
  surveyTemplates: many(surveyTemplates),
  sopCategories: many(sopCategories),
}))

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  imageUrl: text('image_url'),
  menuCoverImageUrl: text('menu_cover_image_url'),
  excursionCoverImageUrl: text('excursion_cover_image_url'),
  location: text('location'),
  oracleHotelId: varchar('oracle_hotel_id', { length: 50 }),
  primaryPmId: uuid('primary_pm_id')
    .references(() => profiles.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.orgId],
    references: [organizations.id],
  }),
  primaryPm: one(profiles, {
    fields: [properties.primaryPmId],
    references: [profiles.id],
  }),
  propertyAssignments: many(propertyAssignments),
  surveySubmissions: many(surveySubmissions),
  issues: many(issues),
  excursions: many(excursions),
  menuCategories: many(menuCategories),
  sopAssignments: many(sopAssignments),
}))

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').default(true).notNull(),
  isFleetAdmin: boolean('is_fleet_admin').default(false).notNull(),
  canBookFleet: boolean('can_book_fleet').default(false).notNull(),
  canUseRestrictedVehicles: boolean('can_use_restricted_vehicles').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [profiles.orgId],
    references: [organizations.id],
  }),
  propertyAssignments: many(propertyAssignments),
  surveySubmissions: many(surveySubmissions),
  createdTemplates: many(surveyTemplates),
  sopAssignments: many(sopAssignments),
}))

// ---------------------------------------------------------------------------
// Property Assignments
// ---------------------------------------------------------------------------
export const propertyAssignments = pgTable(
  'property_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('property_assignments_user_property_unique').on(
      table.userId,
      table.propertyId
    ),
  ]
)

export const propertyAssignmentsRelations = relations(
  propertyAssignments,
  ({ one }) => ({
    user: one(profiles, {
      fields: [propertyAssignments.userId],
      references: [profiles.id],
    }),
    property: one(properties, {
      fields: [propertyAssignments.propertyId],
      references: [properties.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Survey Templates
// ---------------------------------------------------------------------------
export const surveyTemplates = pgTable('survey_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  parentId: uuid('parent_id'),
  surveyType: surveyTypeEnum('survey_type').default('internal').notNull(),
  createdBy: uuid('created_by')
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyTemplatesRelations = relations(
  surveyTemplates,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [surveyTemplates.orgId],
      references: [organizations.id],
    }),
    creator: one(profiles, {
      fields: [surveyTemplates.createdBy],
      references: [profiles.id],
    }),
    parent: one(surveyTemplates, {
      fields: [surveyTemplates.parentId],
      references: [surveyTemplates.id],
    }),
    categories: many(surveyCategories),
    submissions: many(surveySubmissions),
  })
)

// ---------------------------------------------------------------------------
// Survey Categories
// ---------------------------------------------------------------------------
export const surveyCategories = pgTable('survey_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => surveyTemplates.id),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull(),
  weight: numeric('weight', { precision: 5, scale: 2 }).default('1.0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyCategoriesRelations = relations(
  surveyCategories,
  ({ one, many }) => ({
    template: one(surveyTemplates, {
      fields: [surveyCategories.templateId],
      references: [surveyTemplates.id],
    }),
    subcategories: many(surveySubcategories),
  })
)

// ---------------------------------------------------------------------------
// Survey Subcategories
// ---------------------------------------------------------------------------
export const surveySubcategories = pgTable('survey_subcategories', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => surveyCategories.id),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveySubcategoriesRelations = relations(
  surveySubcategories,
  ({ one, many }) => ({
    category: one(surveyCategories, {
      fields: [surveySubcategories.categoryId],
      references: [surveyCategories.id],
    }),
    questions: many(surveyQuestions),
  })
)

// ---------------------------------------------------------------------------
// Survey Questions
// ---------------------------------------------------------------------------
export const surveyQuestions = pgTable('survey_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  subcategoryId: uuid('subcategory_id')
    .notNull()
    .references(() => surveySubcategories.id),
  text: text('text').notNull(),
  description: text('description'),
  scaleMin: integer('scale_min').default(1).notNull(),
  scaleMax: integer('scale_max').default(10).notNull(),
  isRequired: boolean('is_required').default(true).notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyQuestionsRelations = relations(
  surveyQuestions,
  ({ one, many }) => ({
    subcategory: one(surveySubcategories, {
      fields: [surveyQuestions.subcategoryId],
      references: [surveySubcategories.id],
    }),
    responses: many(surveyResponses),
  })
)

// ---------------------------------------------------------------------------
// Guest Survey Links
// ---------------------------------------------------------------------------
export const guestSurveyLinks = pgTable(
  'guest_survey_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => surveyTemplates.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('guest_survey_links_template_property_unique').on(
      table.templateId,
      table.propertyId
    ),
  ]
)

export const guestSurveyLinksRelations = relations(
  guestSurveyLinks,
  ({ one }) => ({
    template: one(surveyTemplates, {
      fields: [guestSurveyLinks.templateId],
      references: [surveyTemplates.id],
    }),
    property: one(properties, {
      fields: [guestSurveyLinks.propertyId],
      references: [properties.id],
    }),
    creator: one(profiles, {
      fields: [guestSurveyLinks.createdBy],
      references: [profiles.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Oracle Guest Profiles + Pre-Arrival
// ---------------------------------------------------------------------------

export const guestProfiles = pgTable(
  'guest_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    oracleReservationId: varchar('oracle_reservation_id', { length: 255 }).notNull(),
    confirmationNumber: varchar('confirmation_number', { length: 255 }),
    guestName: text('guest_name'),
    guestEmail: text('guest_email'),
    arrivalDate: date('arrival_date'),
    departureDate: date('departure_date'),
    roomType: varchar('room_type', { length: 100 }),
    roomNumber: varchar('room_number', { length: 50 }),
    status: guestProfileStatusEnum('status').default('pending_questionnaire').notNull(),
    oracleReservationStatus: varchar('oracle_reservation_status', { length: 100 }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => profiles.id, { onDelete: 'set null' }),
    oracleError: text('oracle_error'),
    lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('guest_profiles_property_reservation_unique').on(
      table.propertyId,
      table.oracleReservationId
    ),
  ]
)

export const preArrivalQuestions = pgTable('pre_arrival_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  prompt: varchar('prompt', { length: 500 }).notNull(),
  type: preArrivalQuestionTypeEnum('type').notNull(),
  options: text('options').array().default(sql`'{}'::text[]`).notNull(),
  required: boolean('required').default(false).notNull(),
  mapsToEta: boolean('maps_to_eta').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const preArrivalAnswers = pgTable('pre_arrival_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestProfileId: uuid('guest_profile_id')
    .notNull()
    .references(() => guestProfiles.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').references(() => preArrivalQuestions.id, {
    onDelete: 'set null',
  }),
  promptSnapshot: varchar('prompt_snapshot', { length: 500 }).notNull(),
  valueText: text('value_text'),
  valueOptions: text('value_options').array().default(sql`'{}'::text[]`).notNull(),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const guestProfilesRelations = relations(guestProfiles, ({ one, many }) => ({
  property: one(properties, {
    fields: [guestProfiles.propertyId],
    references: [properties.id],
  }),
  answers: many(preArrivalAnswers),
}))

export const preArrivalQuestionsRelations = relations(preArrivalQuestions, ({ one }) => ({
  property: one(properties, {
    fields: [preArrivalQuestions.propertyId],
    references: [properties.id],
  }),
}))

export const preArrivalAnswersRelations = relations(preArrivalAnswers, ({ one }) => ({
  guestProfile: one(guestProfiles, {
    fields: [preArrivalAnswers.guestProfileId],
    references: [guestProfiles.id],
  }),
  question: one(preArrivalQuestions, {
    fields: [preArrivalAnswers.questionId],
    references: [preArrivalQuestions.id],
  }),
}))

// ---------------------------------------------------------------------------
// Survey Submissions
// ---------------------------------------------------------------------------
export const surveySubmissions = pgTable('survey_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => surveyTemplates.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id),
  submittedBy: uuid('submitted_by')
    .references(() => profiles.id),
  status: submissionStatusEnum('status').default('draft').notNull(),
  visitDate: date('visit_date').notNull(),
  notes: text('notes'),
  slug: varchar('slug', { length: 255 }).unique(),
  guestName: text('guest_name'),
  guestEmail: text('guest_email'),
  guestLinkId: uuid('guest_link_id')
    .references(() => guestSurveyLinks.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveySubmissionsRelations = relations(
  surveySubmissions,
  ({ one, many }) => ({
    template: one(surveyTemplates, {
      fields: [surveySubmissions.templateId],
      references: [surveyTemplates.id],
    }),
    property: one(properties, {
      fields: [surveySubmissions.propertyId],
      references: [properties.id],
    }),
    submitter: one(profiles, {
      fields: [surveySubmissions.submittedBy],
      references: [profiles.id],
    }),
    responses: many(surveyResponses),
  })
)

// ---------------------------------------------------------------------------
// Survey Responses
// ---------------------------------------------------------------------------
export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => surveySubmissions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id')
    .notNull()
    .references(() => surveyQuestions.id),
  score: integer('score').notNull(),
  note: text('note'),
  issueDescription: text('issue_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyResponsesRelations = relations(
  surveyResponses,
  ({ one }) => ({
    submission: one(surveySubmissions, {
      fields: [surveyResponses.submissionId],
      references: [surveySubmissions.id],
    }),
    question: one(surveyQuestions, {
      fields: [surveyResponses.questionId],
      references: [surveyQuestions.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Issues (auto-created from low-score survey responses)
// ---------------------------------------------------------------------------
export const issues = pgTable('issues', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => surveySubmissions.id),
  responseId: uuid('response_id')
    .notNull()
    .references(() => surveyResponses.id),
  questionId: uuid('question_id')
    .notNull()
    .references(() => surveyQuestions.id),
  title: text('title').notNull(),
  description: text('description'),
  status: issueStatusEnum('status').default('open').notNull(),
  assignedTo: uuid('assigned_to')
    .references(() => profiles.id, { onDelete: 'set null' }),
  isRepeatIssue: boolean('is_repeat_issue').default(false).notNull(),
  closingNotes: text('closing_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by')
    .references(() => profiles.id, { onDelete: 'set null' }),
})

export const issuesRelations = relations(issues, ({ one }) => ({
  organization: one(organizations, {
    fields: [issues.orgId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [issues.propertyId],
    references: [properties.id],
  }),
  submission: one(surveySubmissions, {
    fields: [issues.submissionId],
    references: [surveySubmissions.id],
  }),
  response: one(surveyResponses, {
    fields: [issues.responseId],
    references: [surveyResponses.id],
  }),
  question: one(surveyQuestions, {
    fields: [issues.questionId],
    references: [surveyQuestions.id],
  }),
  assignee: one(profiles, {
    fields: [issues.assignedTo],
    references: [profiles.id],
    relationName: 'issueAssignee',
  }),
  closer: one(profiles, {
    fields: [issues.closedBy],
    references: [profiles.id],
    relationName: 'issueCloser',
  }),
}))

// ---------------------------------------------------------------------------
// Excursions
// ---------------------------------------------------------------------------
// A named place tied to an excursion, with an optional map link (Google Maps).
export type ExcursionLocation = { name: string; mapUrl?: string | null }

export const excursions = pgTable('excursions', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  // What the experience entails — itinerary, choices, duration options.
  experience: text('experience'),
  // What's included in the price (transport, guide, equipment, refreshments…).
  whatsIncluded: text('whats_included'),
  imageUrl: text('image_url'),
  price: text('price'),
  duration: text('duration'),
  // Activity labels, e.g. Culture, Nature, Adventure, Wildlife, Wellness, Community.
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  // Named locations with optional map links.
  locations: jsonb('locations')
    .$type<ExcursionLocation[]>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  bookingUrl: text('booking_url'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const excursionsRelations = relations(excursions, ({ one }) => ({
  property: one(properties, {
    fields: [excursions.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Menu Categories
// ---------------------------------------------------------------------------
export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  menuId: uuid('menu_id')
    .notNull()
    .references(() => menus.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  priceNote: text('price_note'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  property: one(properties, {
    fields: [menuCategories.propertyId],
    references: [properties.id],
  }),
  menu: one(menus, {
    fields: [menuCategories.menuId],
    references: [menus.id],
  }),
  menuItems: many(menuItems),
}))

// ---------------------------------------------------------------------------
// Menu Items
// ---------------------------------------------------------------------------
export const menuItems = pgTable('menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => menuCategories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  price: text('price'),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
}))

// ---------------------------------------------------------------------------
// Menus (parent grouping: 'set' = 7 day-specific menus, 'a_la_carte' = one)
// ---------------------------------------------------------------------------
export const menus = pgTable(
  'menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'set' | 'a_la_carte'
    dayOfWeek: integer('day_of_week'), // 0=Sun..6=Sat; null for a_la_carte
    name: text('name').notNull(),
    description: text('description'),
    priceNote: text('price_note'),
    footerNote: text('footer_note'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('menus_property_type_day_unique').on(
      table.propertyId,
      table.type,
      table.dayOfWeek
    ),
  ]
)

export const menusRelations = relations(menus, ({ one, many }) => ({
  property: one(properties, {
    fields: [menus.propertyId],
    references: [properties.id],
  }),
  categories: many(menuCategories),
}))

// ---------------------------------------------------------------------------
// SOP Categories (org-level grouping for templates)
// ---------------------------------------------------------------------------
export const sopCategories = pgTable(
  'sop_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_categories_org_name_unique').on(table.orgId, table.name),
  ]
)

export const sopCategoriesRelations = relations(sopCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopCategories.orgId],
    references: [organizations.id],
  }),
  templates: many(sopTemplates),
}))

// ---------------------------------------------------------------------------
// SOP Templates
// ---------------------------------------------------------------------------
export const sopTemplates = pgTable('sop_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: uuid('category_id').references(() => sopCategories.id, {
    onDelete: 'restrict',
  }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopTemplatesRelations = relations(sopTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopTemplates.orgId],
    references: [organizations.id],
  }),
  category: one(sopCategories, {
    fields: [sopTemplates.categoryId],
    references: [sopCategories.id],
  }),
  sections: many(sopSections),
  items: many(sopItems),
  assignments: many(sopAssignments),
}))

// ---------------------------------------------------------------------------
// SOP Sections (optional grouping within a template)
// ---------------------------------------------------------------------------
export const sopSections = pgTable('sop_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => sopTemplates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopSectionsRelations = relations(sopSections, ({ one, many }) => ({
  template: one(sopTemplates, {
    fields: [sopSections.templateId],
    references: [sopTemplates.id],
  }),
  items: many(sopItems),
}))

// ---------------------------------------------------------------------------
// SOP Items (checklist items)
// ---------------------------------------------------------------------------
export const sopItems = pgTable('sop_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => sopTemplates.id, { onDelete: 'cascade' }),
  sectionId: uuid('section_id')
    .references(() => sopSections.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopItemsRelations = relations(sopItems, ({ one }) => ({
  template: one(sopTemplates, {
    fields: [sopItems.templateId],
    references: [sopTemplates.id],
  }),
  section: one(sopSections, {
    fields: [sopItems.sectionId],
    references: [sopSections.id],
  }),
}))

// ---------------------------------------------------------------------------
// SOP Assignments (who does what, where, when)
// ---------------------------------------------------------------------------
export const sopAssignments = pgTable(
  'sop_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => sopTemplates.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    frequency: sopFrequencyEnum('frequency').notNull(),
    deadlineTime: text('deadline_time').notNull(),
    deadlineDay: integer('deadline_day'),
    deadlineMonth: integer('deadline_month'),  // for yearly: 1-12
    isActive: boolean('is_active').default(true).notNull(),
    notifyOnOverdue: boolean('notify_on_overdue').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_assignments_template_property_user_unique').on(
      table.templateId,
      table.propertyId,
      table.userId
    ),
  ]
)

export const sopAssignmentsRelations = relations(sopAssignments, ({ one, many }) => ({
  template: one(sopTemplates, {
    fields: [sopAssignments.templateId],
    references: [sopTemplates.id],
  }),
  property: one(properties, {
    fields: [sopAssignments.propertyId],
    references: [properties.id],
  }),
  user: one(profiles, {
    fields: [sopAssignments.userId],
    references: [profiles.id],
  }),
  completions: many(sopCompletions),
}))

// ---------------------------------------------------------------------------
// SOP Completions (instance for a specific due date)
// ---------------------------------------------------------------------------
export const sopCompletions = pgTable(
  'sop_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => sopAssignments.id, { onDelete: 'cascade' }),
    dueDate: date('due_date').notNull(),
    status: sopCompletionStatusEnum('status').default('pending').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_completions_assignment_due_date_unique').on(
      table.assignmentId,
      table.dueDate
    ),
  ]
)

export const sopCompletionsRelations = relations(sopCompletions, ({ one, many }) => ({
  assignment: one(sopAssignments, {
    fields: [sopCompletions.assignmentId],
    references: [sopAssignments.id],
  }),
  itemCompletions: many(sopItemCompletions),
}))

// ---------------------------------------------------------------------------
// SOP Item Completions (individual check-offs)
// ---------------------------------------------------------------------------
export const sopItemCompletions = pgTable(
  'sop_item_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    completionId: uuid('completion_id')
      .notNull()
      .references(() => sopCompletions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => sopItems.id, { onDelete: 'cascade' }),
    isChecked: boolean('is_checked').default(false).notNull(),
    note: text('note'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_item_completions_completion_item_unique').on(
      table.completionId,
      table.itemId
    ),
  ]
)

export const sopItemCompletionsRelations = relations(sopItemCompletions, ({ one }) => ({
  completion: one(sopCompletions, {
    fields: [sopItemCompletions.completionId],
    references: [sopCompletions.id],
  }),
  item: one(sopItems, {
    fields: [sopItemCompletions.itemId],
    references: [sopItems.id],
  }),
}))

// ---------------------------------------------------------------------------
// Allowed Emails (whitelist for email/password auth)
// ---------------------------------------------------------------------------
export const allowedEmails = pgTable('allowed_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  addedBy: uuid('added_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const allowedEmailsRelations = relations(allowedEmails, ({ one }) => ({
  organization: one(organizations, { fields: [allowedEmails.orgId], references: [organizations.id] }),
  addedByProfile: one(profiles, { fields: [allowedEmails.addedBy], references: [profiles.id] }),
}))

// ---------------------------------------------------------------------------
// Utility Rate Tiers (tiered pricing for water/electricity)
// ---------------------------------------------------------------------------
export const utilityRateTiers = pgTable(
  'utility_rate_tiers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    tierNumber: integer('tier_number').notNull(),
    minUnits: numeric('min_units', { precision: 10, scale: 2 }).notNull(),
    maxUnits: numeric('max_units', { precision: 10, scale: 2 }),
    ratePerUnit: numeric('rate_per_unit', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_rate_tiers_property_type_tier_unique').on(
      table.propertyId,
      table.utilityType,
      table.tierNumber
    ),
  ]
)

export const utilityRateTiersRelations = relations(utilityRateTiers, ({ one }) => ({
  property: one(properties, {
    fields: [utilityRateTiers.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Utility Meter Readings (daily cumulative readings)
// ---------------------------------------------------------------------------
export const utilityMeterReadings = pgTable(
  'utility_meter_readings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    readingDate: date('reading_date').notNull(),
    readingValue: numeric('reading_value', { precision: 12, scale: 2 }),
    eveningReading: numeric('evening_reading', { precision: 12, scale: 2 }),
    nightReading: numeric('night_reading', { precision: 12, scale: 2 }),
    morningStatus: readingSlotStatusEnum('morning_status'),
    eveningStatus: readingSlotStatusEnum('evening_status'),
    nightStatus: readingSlotStatusEnum('night_status'),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_meter_readings_property_type_date_unique').on(
      table.propertyId,
      table.utilityType,
      table.readingDate
    ),
  ]
)

export const utilityMeterReadingsRelations = relations(utilityMeterReadings, ({ one }) => ({
  property: one(properties, {
    fields: [utilityMeterReadings.propertyId],
    references: [properties.id],
  }),
  recorder: one(profiles, {
    fields: [utilityMeterReadings.recordedBy],
    references: [profiles.id],
  }),
}))

// ---------------------------------------------------------------------------
// Daily Occupancy (one row per property per day — guests + staff)
// ---------------------------------------------------------------------------
export const dailyOccupancy = pgTable(
  'daily_occupancy',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    logDate: date('log_date').notNull(),
    guestCount: integer('guest_count').default(0).notNull(),
    staffCount: integer('staff_count').default(0).notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('daily_occupancy_property_date_unique').on(table.propertyId, table.logDate),
  ]
)

export const dailyOccupancyRelations = relations(dailyOccupancy, ({ one }) => ({
  property: one(properties, {
    fields: [dailyOccupancy.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Utility KPI Bands (guest-count step function, per property + utility)
// ---------------------------------------------------------------------------
export const utilityKpiBands = pgTable(
  'utility_kpi_bands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    minGuests: integer('min_guests').notNull(),
    targetUnits: numeric('target_units', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_kpi_bands_property_type_minguests_unique').on(
      table.propertyId,
      table.utilityType,
      table.minGuests
    ),
  ]
)

export const utilityKpiBandsRelations = relations(utilityKpiBands, ({ one }) => ({
  property: one(properties, {
    fields: [utilityKpiBands.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Electricity Slot Config (org-wide reading times — labels/guidance only)
// ---------------------------------------------------------------------------
export const electricitySlotConfig = pgTable(
  'electricity_slot_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    morningTime: time('morning_time').default('05:30').notNull(),
    eveningTime: time('evening_time').default('17:30').notNull(),
    nightTime: time('night_time').default('22:30').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('electricity_slot_config_org_unique').on(table.orgId)]
)

// ---------------------------------------------------------------------------
// Daily Wastage (one combined row per property per day, kg per category)
// ---------------------------------------------------------------------------
export const wasteLogs = pgTable(
  'waste_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    logDate: date('log_date').notNull(),
    paperKg: numeric('paper_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    glassKg: numeric('glass_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    plasticKg: numeric('plastic_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    foodKg: numeric('food_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    metalKg: numeric('metal_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    electronicKg: numeric('electronic_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('waste_logs_property_date_unique').on(table.propertyId, table.logDate),
  ]
)

export const wasteLogsRelations = relations(wasteLogs, ({ one }) => ({
  property: one(properties, {
    fields: [wasteLogs.propertyId],
    references: [properties.id],
  }),
  recorder: one(profiles, {
    fields: [wasteLogs.recordedBy],
    references: [profiles.id],
  }),
}))

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------
export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert

export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert

export type PropertyAssignment = typeof propertyAssignments.$inferSelect
export type NewPropertyAssignment = typeof propertyAssignments.$inferInsert

export type SurveyTemplate = typeof surveyTemplates.$inferSelect
export type NewSurveyTemplate = typeof surveyTemplates.$inferInsert

export type SurveyCategory = typeof surveyCategories.$inferSelect
export type NewSurveyCategory = typeof surveyCategories.$inferInsert

export type SurveySubcategory = typeof surveySubcategories.$inferSelect
export type NewSurveySubcategory = typeof surveySubcategories.$inferInsert

export type SurveyQuestion = typeof surveyQuestions.$inferSelect
export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert

export type SurveySubmission = typeof surveySubmissions.$inferSelect
export type NewSurveySubmission = typeof surveySubmissions.$inferInsert

export type SurveyResponse = typeof surveyResponses.$inferSelect
export type NewSurveyResponse = typeof surveyResponses.$inferInsert

export type GuestSurveyLink = typeof guestSurveyLinks.$inferSelect
export type NewGuestSurveyLink = typeof guestSurveyLinks.$inferInsert

export type GuestProfile = typeof guestProfiles.$inferSelect
export type NewGuestProfile = typeof guestProfiles.$inferInsert
export type PreArrivalQuestion = typeof preArrivalQuestions.$inferSelect
export type NewPreArrivalQuestion = typeof preArrivalQuestions.$inferInsert
export type PreArrivalAnswer = typeof preArrivalAnswers.$inferSelect
export type NewPreArrivalAnswer = typeof preArrivalAnswers.$inferInsert

export type Issue = typeof issues.$inferSelect
export type NewIssue = typeof issues.$inferInsert

export type Excursion = typeof excursions.$inferSelect
export type NewExcursion = typeof excursions.$inferInsert

export type Menu = typeof menus.$inferSelect
export type NewMenu = typeof menus.$inferInsert

export type MenuCategory = typeof menuCategories.$inferSelect
export type NewMenuCategory = typeof menuCategories.$inferInsert

export type MenuItem = typeof menuItems.$inferSelect
export type NewMenuItem = typeof menuItems.$inferInsert

export type SopTemplate = typeof sopTemplates.$inferSelect
export type NewSopTemplate = typeof sopTemplates.$inferInsert

export type SopSection = typeof sopSections.$inferSelect
export type NewSopSection = typeof sopSections.$inferInsert

export type SopItem = typeof sopItems.$inferSelect
export type NewSopItem = typeof sopItems.$inferInsert

export type SopAssignment = typeof sopAssignments.$inferSelect
export type NewSopAssignment = typeof sopAssignments.$inferInsert

export type SopCompletion = typeof sopCompletions.$inferSelect
export type NewSopCompletion = typeof sopCompletions.$inferInsert

export type SopItemCompletion = typeof sopItemCompletions.$inferSelect
export type NewSopItemCompletion = typeof sopItemCompletions.$inferInsert

export type SopCategory = typeof sopCategories.$inferSelect
export type NewSopCategory = typeof sopCategories.$inferInsert

export type AllowedEmail = typeof allowedEmails.$inferSelect
export type NewAllowedEmail = typeof allowedEmails.$inferInsert

export type UtilityRateTier = typeof utilityRateTiers.$inferSelect
export type NewUtilityRateTier = typeof utilityRateTiers.$inferInsert

export type UtilityMeterReading = typeof utilityMeterReadings.$inferSelect
export type NewUtilityMeterReading = typeof utilityMeterReadings.$inferInsert

export type DailyOccupancy = typeof dailyOccupancy.$inferSelect
export type NewDailyOccupancy = typeof dailyOccupancy.$inferInsert
export type UtilityKpiBand = typeof utilityKpiBands.$inferSelect
export type NewUtilityKpiBand = typeof utilityKpiBands.$inferInsert
export type ElectricitySlotConfig = typeof electricitySlotConfig.$inferSelect
export type NewElectricitySlotConfig = typeof electricitySlotConfig.$inferInsert

export type WasteLog = typeof wasteLogs.$inferSelect
export type NewWasteLog = typeof wasteLogs.$inferInsert

// ---------------------------------------------------------------------------
// Employee Tasks
// ---------------------------------------------------------------------------
export const taskStatusEnum = pgEnum('task_status', ['todo','in_progress','stuck','done'])
export const taskPriorityEnum = pgEnum('task_priority', ['low','medium','high'])

export const taskTeams = pgTable('task_teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('task_teams_org_name_unique').on(t.orgId, t.name)])

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('todo').notNull(),
  priority: taskPriorityEnum('priority').default('medium').notNull(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  startDate: date('start_date'),
  position: integer('position').default(0).notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const taskAssignees = pgTable('task_assignees', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
}, (t) => [unique('task_assignees_pk').on(t.taskId, t.profileId)])

export const taskTeamLinks = pgTable('task_team_links', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').notNull().references(() => taskTeams.id, { onDelete: 'cascade' }),
}, (t) => [unique('task_team_links_pk').on(t.taskId, t.teamId)])

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, { fields: [tasks.orgId], references: [organizations.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  property: one(properties, { fields: [tasks.propertyId], references: [properties.id] }),
  creator: one(profiles, { fields: [tasks.createdBy], references: [profiles.id] }),
  assignees: many(taskAssignees),
  teamLinks: many(taskTeamLinks),
}))
export const taskTeamsRelations = relations(taskTeams, ({ many }) => ({ links: many(taskTeamLinks) }))
export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  profile: one(profiles, { fields: [taskAssignees.profileId], references: [profiles.id] }),
}))
export const taskTeamLinksRelations = relations(taskTeamLinks, ({ one }) => ({
  task: one(tasks, { fields: [taskTeamLinks.taskId], references: [tasks.id] }),
  team: one(taskTeams, { fields: [taskTeamLinks.teamId], references: [taskTeams.id] }),
}))

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskTeam = typeof taskTeams.$inferSelect
export type NewTaskTeam = typeof taskTeams.$inferInsert
export type TaskAssignee = typeof taskAssignees.$inferSelect
export type NewTaskAssignee = typeof taskAssignees.$inferInsert
export type TaskTeamLink = typeof taskTeamLinks.$inferSelect
export type NewTaskTeamLink = typeof taskTeamLinks.$inferInsert

// ---------------------------------------------------------------------------
// Projects (layer above tasks)
// ---------------------------------------------------------------------------
export const projectStatusEnum = pgEnum('project_status', ['active', 'archived'])

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 32 }),
  status: projectStatusEnum('status').default('active').notNull(),
  targetDate: date('target_date'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('projects_org_name_unique').on(t.orgId, t.name)])

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  creator: one(profiles, { fields: [projects.createdBy], references: [profiles.id] }),
  tasks: many(tasks),
}))

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

// ---------------------------------------------------------------------------
// Fixed Asset Registry
// ---------------------------------------------------------------------------
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    floorLevel: text('floor_level'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('rooms_property_name_unique').on(t.propertyId, t.name)],
)

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetCode: text('asset_code').notNull().unique(),
  name: text('name').notNull(),
  category: assetCategoryEnum('category').notNull(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  purchaseDate: date('purchase_date').notNull(),
  purchaseCost: numeric('purchase_cost', { precision: 12, scale: 2 }).notNull(),
  usefulLifeYears: integer('useful_life_years').notNull(),
  salvageValue: numeric('salvage_value', { precision: 12, scale: 2 }).default('0').notNull(),
  status: assetStatusEnum('status').default('active').notNull(),
  serialNumber: text('serial_number'),
  vendorName: text('vendor_name'),
  warrantyExpiry: date('warranty_expiry'),
  imageUrl: text('image_url'),
  qrUrl: text('qr_url').unique(),
  lastAuditedAt: timestamp('last_audited_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maintenanceLogs = pgTable('maintenance_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  reportedBy: uuid('reported_by').references(() => profiles.id, { onDelete: 'set null' }),
  serviceDate: date('service_date'),
  issueDescription: text('issue_description').notNull(),
  repairCost: numeric('repair_cost', { precision: 12, scale: 2 }),
  resolutionStatus: maintenanceStatusEnum('resolution_status').default('pending').notNull(),
  resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const assetEvents = pgTable('asset_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(), // created | audited | moved | status_changed | repair_flagged
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  property: one(properties, { fields: [rooms.propertyId], references: [properties.id] }),
  assets: many(assets),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
  property: one(properties, { fields: [assets.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [assets.roomId], references: [rooms.id] }),
  maintenanceLogs: many(maintenanceLogs),
  events: many(assetEvents),
}))

export const maintenanceLogsRelations = relations(maintenanceLogs, ({ one }) => ({
  asset: one(assets, { fields: [maintenanceLogs.assetId], references: [assets.id] }),
}))

export const assetEventsRelations = relations(assetEvents, ({ one }) => ({
  asset: one(assets, { fields: [assetEvents.assetId], references: [assets.id] }),
}))

export type Room = typeof rooms.$inferSelect
export type NewRoom = typeof rooms.$inferInsert
export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect
export type NewMaintenanceLog = typeof maintenanceLogs.$inferInsert
export type AssetEvent = typeof assetEvents.$inferSelect
export type NewAssetEvent = typeof assetEvents.$inferInsert

// ---------------------------------------------------------------------------
// Fleet & Visit Command
// ---------------------------------------------------------------------------
export const fleetRequestTypeEnum = pgEnum('fleet_request_type', ['visit', 'standalone'])
export const fleetRequestStatusEnum = pgEnum('fleet_request_status', [
  'pending', 'queued', 'dispatched', 'completed', 'cancelled',
])
export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'draft', 'approved', 'in_progress', 'completed', 'cancelled',
])
export const vehicleStatusEnum = pgEnum('vehicle_status', ['active', 'maintenance', 'retired'])
export const driverLanguageEnum = pgEnum('driver_language', ['en', 'si', 'ta'])

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  registrationNo: varchar('registration_no', { length: 50 }),
  maxPassengers: integer('max_passengers').notNull(),
  cargoCapable: boolean('cargo_capable').default(false).notNull(),
  isRestricted: boolean('is_restricted').default(false).notNull(),
  status: vehicleStatusEnum('status').default('active').notNull(),
  currentLocationPropertyId: uuid('current_location_property_id')
    .references(() => properties.id, { onDelete: 'set null' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('vehicles_org_name_unique').on(t.orgId, t.name)])

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  fullName: text('full_name').notNull(),
  phone: varchar('phone', { length: 50 }),
  preferredLanguage: driverLanguageEnum('preferred_language').default('en').notNull(),
  accessToken: varchar('access_token', { length: 32 }).notNull().unique(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const driverVehicles = pgTable('driver_vehicles', {
  driverId: uuid('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
}, (t) => [unique('driver_vehicles_pk').on(t.driverId, t.vehicleId)])

export const propertyDistances = pgTable('property_distances', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  fromPropertyId: uuid('from_property_id').references(() => properties.id, { onDelete: 'cascade' }),
  toPropertyId: uuid('to_property_id').references(() => properties.id, { onDelete: 'cascade' }),
  distanceKm: numeric('distance_km', { precision: 6, scale: 1 }).notNull(),
  driveMinutes: integer('drive_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fleetSettings = pgTable('fleet_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().unique().references(() => organizations.id),
  poolingThresholdKm: numeric('pooling_threshold_km', { precision: 6, scale: 1 }).default('40.0').notNull(),
  planningHorizonDays: integer('planning_horizon_days').default(14).notNull(),
  engineEnabled: boolean('engine_enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fleetRequests = pgTable('fleet_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  requestType: fleetRequestTypeEnum('request_type').notNull(),
  requestedBy: uuid('requested_by').notNull().references(() => profiles.id),
  targetPropertyId: uuid('target_property_id').references(() => properties.id, { onDelete: 'set null' }),
  originText: text('origin_text'),
  destinationText: text('destination_text'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  paxCount: integer('pax_count').default(1).notNull(),
  cargoRequired: boolean('cargo_required').default(false).notNull(),
  purpose: text('purpose'),
  notes: text('notes'),
  status: fleetRequestStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dispatches = pgTable('dispatches', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  driverId: uuid('driver_id').notNull().references(() => drivers.id, { onDelete: 'restrict' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: dispatchStatusEnum('status').default('draft').notNull(),
  generatedBy: varchar('generated_by', { length: 16 }).default('engine').notNull(),
  approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dispatchStops = pgTable('dispatch_stops', {
  id: uuid('id').defaultRandom().primaryKey(),
  dispatchId: uuid('dispatch_id').notNull().references(() => dispatches.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').references(() => fleetRequests.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  label: text('label'),
  sortOrder: integer('sort_order').default(0).notNull(),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  linkUrl: text('link_url'),
  channel: varchar('channel', { length: 16 }).default('in_app').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  deliveryError: text('delivery_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  organization: one(organizations, { fields: [vehicles.orgId], references: [organizations.id] }),
  currentLocation: one(properties, {
    fields: [vehicles.currentLocationPropertyId],
    references: [properties.id],
  }),
  driverLinks: many(driverVehicles),
  dispatches: many(dispatches),
}))

export const driversRelations = relations(drivers, ({ one, many }) => ({
  organization: one(organizations, { fields: [drivers.orgId], references: [organizations.id] }),
  vehicleLinks: many(driverVehicles),
  dispatches: many(dispatches),
}))

export const driverVehiclesRelations = relations(driverVehicles, ({ one }) => ({
  driver: one(drivers, { fields: [driverVehicles.driverId], references: [drivers.id] }),
  vehicle: one(vehicles, { fields: [driverVehicles.vehicleId], references: [vehicles.id] }),
}))

export const fleetRequestsRelations = relations(fleetRequests, ({ one, many }) => ({
  organization: one(organizations, { fields: [fleetRequests.orgId], references: [organizations.id] }),
  requester: one(profiles, { fields: [fleetRequests.requestedBy], references: [profiles.id] }),
  targetProperty: one(properties, {
    fields: [fleetRequests.targetPropertyId],
    references: [properties.id],
  }),
  stops: many(dispatchStops),
}))

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  organization: one(organizations, { fields: [dispatches.orgId], references: [organizations.id] }),
  vehicle: one(vehicles, { fields: [dispatches.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [dispatches.driverId], references: [drivers.id] }),
  approver: one(profiles, { fields: [dispatches.approvedBy], references: [profiles.id] }),
  stops: many(dispatchStops),
}))

export const dispatchStopsRelations = relations(dispatchStops, ({ one }) => ({
  dispatch: one(dispatches, { fields: [dispatchStops.dispatchId], references: [dispatches.id] }),
  request: one(fleetRequests, { fields: [dispatchStops.requestId], references: [fleetRequests.id] }),
  property: one(properties, { fields: [dispatchStops.propertyId], references: [properties.id] }),
}))

export type Vehicle = typeof vehicles.$inferSelect
export type NewVehicle = typeof vehicles.$inferInsert
export type Driver = typeof drivers.$inferSelect
export type NewDriver = typeof drivers.$inferInsert
export type PropertyDistance = typeof propertyDistances.$inferSelect
export type FleetSetting = typeof fleetSettings.$inferSelect
export type FleetRequest = typeof fleetRequests.$inferSelect
export type NewFleetRequest = typeof fleetRequests.$inferInsert
export type Dispatch = typeof dispatches.$inferSelect
export type NewDispatch = typeof dispatches.$inferInsert
export type DispatchStop = typeof dispatchStops.$inferSelect
export type NewDispatchStop = typeof dispatchStops.$inferInsert
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type Notification = typeof notifications.$inferSelect
