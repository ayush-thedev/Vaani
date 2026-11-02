import ipaddress
import socket
from urllib.parse import urlparse

# Private / reserved IPv4 and IPv6 networks
BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

MAX_INPUT_CHARS = 50000
MAX_ARTICLE_PROCESS_CHARS = 15000


def validate_url(url_str: str) -> str:
    """
    Validates a URL for HTTP/HTTPS scheme and ensures it does not
    point to localhost or private/internal infrastructure (SSRF protection).
    """
    parsed = urlparse(url_str.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Invalid URL scheme. Only HTTP and HTTPS are permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL. Hostname is missing.")

    # Disallow common local keywords
    if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        raise ValueError("Access to internal hostnames is prohibited.")

    # Resolve hostname to IP to protect against SSRF via DNS rebinding / local IPs
    try:
        resolved_ips = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError(f"Could not resolve host: {hostname}")

    for item in resolved_ips:
        ip_str = item[4][0]
        ip_obj = ipaddress.ip_address(ip_str)
        for net in BLOCKED_NETWORKS:
            if ip_obj in net:
                raise ValueError("Access to private/local network addresses is prohibited.")

    return url_str.strip()


def validate_text(text: str) -> str:
    """
    Validates text input length.
    """
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("Text content cannot be empty.")
    if len(cleaned) > MAX_INPUT_CHARS:
        raise ValueError(f"Input exceeds maximum allowed length of {MAX_INPUT_CHARS} characters.")
    return cleaned
