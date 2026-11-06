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

    def test_worker_control_auth_is_required_for_get_and_post(self):
        tree = ast.parse((ROOT / 'worker_bridge.py').read_text(encoding='utf-8'))
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'ApiHandler')
        for name in ['do_GET', 'do_POST']:
            method = next(node for node in handler.body if isinstance(node, ast.FunctionDef) and node.name == name)
            self.assertIsInstance(method.body[0], ast.If)
            self.assertIn('authorized', ast.unparse(method.body[0]))


if __name__ == '__main__':
    unittest.main()
