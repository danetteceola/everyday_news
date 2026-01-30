## ADDED Requirements

### Requirement: Database schema defines core tables
The system SHALL define core database tables for storing news data, summaries, and logs.

#### Scenario: Create platforms table
- **WHEN** database schema is initialized
- **THEN** system SHALL create platforms table with columns: id, name, icon, created_at

#### Scenario: Create news_items table
- **WHEN** database schema is initialized
- **THEN** system SHALL create news_items table with columns: id, platform_id, external_id, title, content, url, author, publish_time, engagement metrics, tags, category, is_investment_related, summary, created_at

#### Scenario: Create daily_summaries table
- **WHEN** database schema is initialized
- **THEN** system SHALL create daily_summaries table with columns: id, date, domestic_hotspots, international_hotspots, investment_hotspots, generated_at

#### Scenario: Create crawl_logs table
- **WHEN** database schema is initialized
- **THEN** system SHALL create crawl_logs table with columns: id, platform_id, started_at, completed_at, items_collected, status, error_message

### Requirement: Database schema enforces data integrity
The system SHALL enforce data integrity through constraints and relationships.

#### Scenario: Enforce foreign key constraints
- **WHEN** news_items record references platform
- **THEN** system SHALL enforce foreign key constraint between news_items.platform_id and platforms.id

#### Scenario: Enforce unique constraints
- **WHEN** inserting news item with same platform and external_id
- **THEN** system SHALL reject duplicate due to UNIQUE(platform_id, external_id) constraint

#### Scenario: Enforce date uniqueness
- **WHEN** inserting daily summary for same date
- **THEN** system SHALL reject duplicate due to UNIQUE(date) constraint

### Requirement: Database schema supports data types and formats
The system SHALL use appropriate data types and formats for different data.

#### Scenario: Store JSON data in text fields
- **WHEN** storing tags or hotspots data
- **THEN** system SHALL store as JSON text in TEXT columns for flexibility

#### Scenario: Use appropriate date/time types
- **WHEN** storing timestamps
- **THEN** system SHALL use DATETIME type for accurate time storage

#### Scenario: Use boolean for flags
- **WHEN** storing investment-related flag
- **THEN** system SHALL use BOOLEAN type for clear true/false values

### Requirement: Database schema provides default values
The system SHALL provide sensible default values for columns.

#### Scenario: Default timestamp for created_at
- **WHEN** inserting record without specifying created_at
- **THEN** system SHALL use CURRENT_TIMESTAMP as default

#### Scenario: Default values for engagement metrics
- **WHEN** inserting news item without engagement metrics
- **THEN** system SHALL use 0 as default for views, likes, shares, comments

#### Scenario: Default status for crawl logs
- **WHEN** creating crawl log without status
- **THEN** system SHALL use 'running' as default status