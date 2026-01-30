## ADDED Requirements

### Requirement: Summary templates define output structure
The system SHALL use templates to define the structure and format of generated summaries.

#### Scenario: Use daily summary template
- **WHEN** generating daily news summary
- **THEN** system SHALL use predefined daily summary template with sections for overview, domestic hotspots, international hotspots, and investment hotspots

#### Scenario: Apply template variables
- **WHEN** template contains variables
- **THEN** system SHALL replace variables with actual data (date, platform counts, etc.)

#### Scenario: Generate structured output
- **WHEN** summary is generated
- **THEN** system SHALL produce structured output according to template format

### Requirement: Summary templates support customization
The system SHALL support customization of summary templates.

#### Scenario: Load template from file
- **WHEN** system starts
- **THEN** system SHALL load summary templates from template files

#### Scenario: Support multiple template versions
- **WHEN** different template versions are available
- **THEN** system SHALL support selecting appropriate template version

#### Scenario: Allow template modification
- **WHEN** administrator modifies template
- **THEN** system SHALL use modified template for future summaries

### Requirement: Summary templates handle different content types
The system SHALL provide different templates for different types of summaries.

#### Scenario: Use standard news summary template
- **WHEN** generating regular daily summary
- **THEN** system SHALL use standard news summary template

#### Scenario: Use investment-focused template
- **WHEN** generating investment summary
- **THEN** system SHALL use investment-focused template with financial analysis sections

#### Scenario: Use brief summary template
- **WHEN** generating quick overview
- **THEN** system SHALL use brief summary template with condensed format

### Requirement: Summary templates integrate with AI generation
The system SHALL integrate templates with AI generation process.

#### Scenario: Combine template structure with AI content
- **WHEN** generating summary
- **THEN** system SHALL combine template structure with AI-generated content

#### Scenario: Use template as prompt guide
- **WHEN** constructing AI prompt
- **THEN** system SHALL use template structure to guide AI output format

#### Scenario: Validate AI output against template
- **WHEN** AI generates summary
- **THEN** system SHALL validate that output matches template structure

### Requirement: Summary templates support internationalization
The system SHALL support templates in different languages.

#### Scenario: Use Chinese template
- **WHEN** generating summary for Chinese audience
- **THEN** system SHALL use Chinese language template

#### Scenario: Use English template
- **WHEN** generating summary for international audience
- **THEN** system SHALL use English language template

#### Scenario: Support template language switching
- **WHEN** configuration specifies language
- **THEN** system SHALL use appropriate language template