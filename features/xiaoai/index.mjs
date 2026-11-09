// Shared backend: instantiate music once, then pass it to the assistant.
// initialize() auto-starts owned workers only with existing LAN consent and no opt-out.
export { XiaoAiMusicModule } from './music.mjs';
export { XiaoAiAssistantModule } from './assistant.mjs';
