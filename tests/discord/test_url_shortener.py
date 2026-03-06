from unittest.mock import patch, MagicMock
from src.discord.url_shortener import shorten_url


class TestShortenUrl:
    def test_returns_shortened_url_on_success(self):
        # Given: TinyURL API が短縮URLを返す
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.status = 200
        mock_resp.read.return_value = b"https://tinyurl.com/abc123\n"

        with patch("urllib.request.urlopen", return_value=mock_resp):
            # When: 長いURLを短縮する
            result = shorten_url("https://example.com/" + "a" * 600)

        # Then: 短縮URLが返される
        assert result == "https://tinyurl.com/abc123"

    def test_returns_none_on_non_200_status(self):
        # Given: TinyURL API が 500 を返す
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.status = 500

        with patch("urllib.request.urlopen", return_value=mock_resp):
            # When: 短縮を試みる
            result = shorten_url("https://example.com/long")

        # Then: None が返される
        assert result is None

    def test_returns_none_on_network_error(self):
        # Given: ネットワークエラーが発生する
        with patch("urllib.request.urlopen", side_effect=Exception("timeout")):
            # When: 短縮を試みる
            result = shorten_url("https://example.com/long")

        # Then: None が返される（例外が伝播しない）
        assert result is None

    def test_url_is_encoded_in_request(self):
        # Given: URLに特殊文字が含まれる
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.status = 200
        mock_resp.read.return_value = b"https://tinyurl.com/xyz"

        captured_url = []

        def capture(url, timeout):
            captured_url.append(url)
            return mock_resp

        with patch("urllib.request.urlopen", side_effect=capture):
            shorten_url("https://example.com/path?q=hello world")

        # Then: URLがエンコードされてリクエストされる
        assert "hello%20world" in captured_url[0]
