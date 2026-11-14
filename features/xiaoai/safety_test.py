"""Pure fixture/mocked tests. Never starts a worker, listener, or real speaker command."""
import ast
import asyncio
import json
from pathlib import Path
import shlex
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'runtime'))
import player_control
from stop_commands import is_stop_command
from music_service import LocalMusicHttpServer


class SafetyTests(unittest.TestCase):
    def test_all_python_sources_parse_without_importing_worker(self):
        for path in ROOT.rglob('*.py'):
            ast.parse(path.read_text(encoding='utf-8'), filename=str(path))

    def test_speaker_shell_arguments_roundtrip_quotes_as_data(self):
        commands = []
        original = player_control.run_shell
        async def fake(script, timeout_ms=10000):
            commands.append(script)
            return {'exit_code': 0}
        player_control.run_shell = fake
        try:
            text = "Fixture ' ; touch /tmp/NOT_EXECUTED ; echo '"
            asyncio.run(player_control.ask_xiaoai(text))
            args = shlex.split(commands[-1])
            self.assertEqual(args[:4], ['ubus', 'call', 'mibrain', 'ai_service'])
            self.assertEqual(len(args), 5)
            self.assertEqual(json.loads(args[-1])['nlp_text'], text)
            url = "http://127.0.0.1:18080/file/fixture'quote.mp3"
            asyncio.run(player_control.play_music_url(url))
            args = shlex.split(commands[-1])
            self.assertEqual(len(args), 5)
            self.assertEqual(json.loads(args[-1])['url'], url)
        finally:
            player_control.run_shell = original

    def test_builtin_stop_commands_do_not_broaden_into_device_commands(self):
        for phrase in ['停止播放', '小爱同学，请停止播放吧', '闭嘴吧', '停了']:
            self.assertTrue(is_stop_command(phrase), phrase)
        for phrase in ['关灯', '关闭空调', '播放别放了']:
            self.assertFalse(is_stop_command(phrase), phrase)

    def test_music_urls_reject_outside_roots_without_binding_server(self):
        import threading
        server = LocalMusicHttpServer.__new__(LocalMusicHttpServer)
        server.base_url = 'http://127.0.0.1:18080'
        server._allowed_files = set()
        server._lock = threading.Lock()
        with tempfile.TemporaryDirectory(prefix='pocket-kit-xiaoai-fixture-') as directory:
            allowed = Path(directory) / 'music'
            allowed.mkdir()
            song = allowed / 'fixture.mp3'
            song.write_bytes(b'fixture-only')
            outside = Path(directory) / 'private.mp3'
            outside.write_bytes(b'fixture-only')
            server.allowed_dirs = [str(allowed.resolve())]
            self.assertIn('/file/', server.create_file_url(str(song)))
            with self.assertRaises(ValueError):
                server.create_file_url(str(outside))
            link = allowed / 'symlink.mp3'
            link.symlink_to(outside)
            with self.assertRaises(ValueError):
                server.create_file_url(str(link))

    def test_play_mode_validates_and_keeps_source_for_looping(self):
        from types import SimpleNamespace
        tree = ast.parse((ROOT / 'worker_bridge.py').read_text(encoding='utf-8'))
        runtime = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Runtime')
        current = object()
        app = SimpleNamespace(local_music_lock=asyncio.Lock(), play_source=[], current_song=current, play_queue=[], play_mode='sequence')
        scope = {'App': app, 'random': SimpleNamespace(shuffle=lambda queue: queue.reverse())}
        exec(compile(ast.Module(body=[runtime], type_ignores=[]), '<fixture-runtime>', 'exec'), scope)
        asyncio.run(scope['Runtime'].set_play_mode('loop-all'))
        self.assertEqual(app.play_mode, 'loop-all')
        self.assertEqual(app.play_source, [current])
        asyncio.run(scope['Runtime'].set_play_mode('shuffle'))
        self.assertEqual(app.play_mode, 'shuffle')
        with self.assertRaises(ValueError):
            asyncio.run(scope['Runtime'].set_play_mode('repeat-all'))

    def test_playlist_route_passes_mode_and_ordered_source(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        tree = ast.parse((ROOT / 'worker_bridge.py').read_text(encoding='utf-8'))
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'ApiHandler')
        method = next(node for node in handler.body if isinstance(node, ast.FunctionDef) and node.name == 'do_POST')
        play = Mock(return_value='operation')
        run = Mock()
        scope = {'Runtime': SimpleNamespace(play_playlist=play), 'run_async': run}
        exec(compile(ast.Module(body=[method], type_ignores=[]), '<fixture-handler>', 'exec'), scope)
        payload = {'mode': 'loop-all', 'source': ['/music/a.mp3', '/music/b.mp3'], 'paths': ['/music/b.mp3']}
        fake = SimpleNamespace(path='/queue/playlist', authorized=lambda: True, read_json=lambda: payload, send_json=Mock())
        scope['do_POST'](fake)
        play.assert_called_once_with('loop-all', ['/music/a.mp3', '/music/b.mp3'], ['/music/b.mp3'])
        run.assert_called_once_with('operation')
        fake.send_json.assert_called_once_with(200, {'success': True})

    def test_worker_playback_logger_is_defined_before_routes(self):
        tree = ast.parse((ROOT / 'worker_bridge.py').read_text(encoding='utf-8'))
        imports_logging = any(
            isinstance(node, ast.Import) and any(alias.name == 'logging' for alias in node.names)
            for node in tree.body
        )
        logger_defined = any(
            isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == 'logger' for target in node.targets)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Attribute)
            and node.value.func.attr == 'getLogger'
            for node in tree.body
        )
        self.assertTrue(imports_logging)
        self.assertTrue(logger_defined)

    def test_worker_control_auth_is_required_for_get_and_post(self):
        tree = ast.parse((ROOT / 'worker_bridge.py').read_text(encoding='utf-8'))
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'ApiHandler')
        for name in ['do_GET', 'do_POST']:
            method = next(node for node in handler.body if isinstance(node, ast.FunctionDef) and node.name == name)
            self.assertIsInstance(method.body[0], ast.If)
            self.assertIn('authorized', ast.unparse(method.body[0]))


if __name__ == '__main__':
    unittest.main()
