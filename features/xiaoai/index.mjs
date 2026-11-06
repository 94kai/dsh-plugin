// Shared backend: instantiate music once, then pass it to the assistant.
// initialize() reads local data only; worker start always requires explicit action.
export { XiaoAiMusicModule } from './music.mjs';
export { XiaoAiAssistantModule } from './assistant.mjs';
