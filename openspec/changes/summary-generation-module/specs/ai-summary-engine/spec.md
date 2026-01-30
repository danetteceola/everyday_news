## ADDED Requirements

### Requirement: AI summary engine generates daily news summaries
The system SHALL use AI language models to generate daily news summaries from collected news data.

#### Scenario: Generate domestic hotspots summary
- **WHEN** system needs to summarize domestic news
- **THEN** system SHALL use AI to analyze domestic news items and generate top 5 domestic hotspots

#### Scenario: Generate international hotspots summary
- **WHEN** system needs to summarize international news
- **THEN** system SHALL use AI to analyze international news items and generate top 5 international hotspots

#### Scenario: Generate investment hotspots summary
- **WHEN** system needs to summarize investment-related news
- **THEN** system SHALL use AI to analyze investment news items and generate investment hotspots analysis

### Requirement: AI summary engine supports multiple LLM providers
The system SHALL support multiple LLM providers for flexibility and cost optimization.

#### Scenario: Use Claude API for summary generation
- **WHEN** Claude API is available and configured
- **THEN** system SHALL use Claude API for high-quality summary generation

#### Scenario: Fallback to DeepSeek API
- **WHEN** Claude API is unavailable or cost constraints apply
- **THEN** system SHALL use DeepSeek API as cost-effective alternative

#### Scenario: Switch between providers based on configuration
- **WHEN** system configuration specifies preferred provider
- **THEN** system SHALL use configured provider for summary generation

### Requirement: AI summary engine optimizes prompt engineering
The system SHALL use optimized prompts for effective summary generation.

#### Scenario: Use structured prompt template
- **WHEN** generating summary
- **THEN** system SHALL use structured prompt template with news data and instructions

#### Scenario: Include context and constraints in prompt
- **WHEN** constructing prompt
- **THEN** system SHALL include context about news sources, date, and output format constraints

#### Scenario: Optimize prompt for different news categories
- **WHEN** generating different types of summaries
- **THEN** system SHALL use category-specific prompt variations

### Requirement: AI summary engine manages API interactions
The system SHALL handle all LLM API interactions including error handling and rate limiting.

#### Scenario: Handle API rate limiting
- **WHEN** LLM API returns rate limit error
- **THEN** system SHALL implement exponential backoff and retry logic

#### Scenario: Handle API authentication errors
- **WHEN** LLM API returns authentication error
- **THEN** system SHALL log error and notify administrator for credential update

#### Scenario: Handle API response parsing
- **WHEN** LLM API returns response
- **THEN** system SHALL parse response and extract summary content

### Requirement: AI summary engine provides cost optimization
The system SHALL optimize LLM usage for cost efficiency.

#### Scenario: Limit token usage
- **WHEN** generating summary
- **THEN** system SHALL limit prompt and response tokens to control cost

#### Scenario: Cache similar summaries
- **WHEN** similar news data needs summarization
- **THEN** system SHALL cache previous summaries to reduce API calls

#### Scenario: Use appropriate model for task
- **WHEN** generating simple summaries
- **THEN** system SHALL use cost-effective model (e.g., DeepSeek)

#### Scenario: Use advanced model for complex analysis
- **WHEN** analyzing complex investment trends
- **THEN** system SHALL use more capable model (e.g., Claude Opus)