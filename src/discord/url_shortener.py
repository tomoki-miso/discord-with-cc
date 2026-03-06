import urllib.request
import urllib.parse

_TINYURL_API = "https://tinyurl.com/api-create.php"
_TIMEOUT = 3.0


def shorten_url(url: str) -> str | None:
    """TinyURL API でURLを短縮する。失敗した場合は None を返す。"""
    encoded = urllib.parse.quote(url, safe="")
    request_url = f"{_TINYURL_API}?url={encoded}"
    try:
        with urllib.request.urlopen(request_url, timeout=_TIMEOUT) as resp:
            if resp.status == 200:
                return resp.read().decode().strip()
    except Exception:
        pass
    return None
