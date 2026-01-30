## ADDED Requirements

### Requirement: Summary triggers support scheduled execution
The system SHALL support scheduled triggering of summary generation.

#### Scenario: Schedule daily summary generation
- **WHEN** system is configured for daily summary
- **THEN** system SHALL schedule summary generation at configured times (e.g., 10:00, 22:00)

#### Scenario: Execute scheduled summary
- **WHEN** scheduled time arrives
- **THEN** system SHALL automatically generate summary for previous day's news

#### Scenario: Handle missed schedules
- **WHEN** system misses scheduled execution
- **THEN** system SHALL catch up on missed summaries when system resumes

### Requirement: Summary triggers support manual execution
The system SHALL support manual triggering of summary generation.

#### Scenario: Manual trigger via command line
- **WHEN** administrator runs summary command
- **THEN** system SHALL generate summary immediately

#### Scenario: Manual trigger for specific date
- **WHEN** administrator specifies date for summary
- **THEN** system SHALL generate summary for specified date

#### Scenario: Manual trigger with custom parameters
- **WHEN** administrator provides custom parameters
- **THEN** system SHALL generate summary with specified parameters

### Requirement: Summary triggers support API execution
The system SHALL support API triggering of summary generation.

#### Scenario: Trigger via REST API
- **WHEN** API request is received at /api/summary
- **THEN** system SHALL generate summary and return results

#### Scenario: API with authentication
- **WHEN** API request includes authentication
- **THEN** system SHALL verify authentication before executing

#### Scenario: API with async response
- **WHEN** summary generation takes time
- **THEN** system SHALL support async API with job tracking

### Requirement: Summary triggers manage execution context
The system SHALL manage execution context for different trigger types.

#### Scenario: Track trigger source
- **WHEN** summary is generated
- **THEN** system SHALL record trigger source (scheduled, manual, API)

#### Scenario: Handle concurrent triggers
- **WHEN** multiple triggers occur simultaneously
- **THEN** system SHALL manage concurrent execution to avoid conflicts

#### Scenario: Prioritize trigger types
- **WHEN** different trigger types conflict
- **THEN** system SHALL prioritize triggers according to configuration

### Requirement: Summary triggers provide execution monitoring
The system SHALL monitor summary trigger execution.

#### Scenario: Log trigger execution
- **WHEN** trigger executes
- **THEN** system SHALL log execution details including time, parameters, and result

#### Scenario: Monitor trigger success rate
- **WHEN** triggers execute
- **THEN** system SHALL track success/failure rate for each trigger type

#### Scenario: Alert on trigger failures
- **WHEN** trigger fails repeatedly
- **THEN** system SHALL send alert through notification system