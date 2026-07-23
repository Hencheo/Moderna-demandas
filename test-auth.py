#!/usr/bin/env python
"""
Teste de autenticação no SISCON.
1. Faz GET no /Login pra pegar __VIEWSTATE + cookie de sessão
2. POST com credenciais
3. Tenta acessar a página autenticada
4. Salva o HTML pra inspecionar
"""

import re
import urllib.request
import urllib.parse
import http.cookiejar
import ssl
import sys

BASE_URL = "https://siscon.benner.com.br"

def get_input_names(html):
    """Extrai os nomes dos campos do ASP.NET WebForms"""
    viewstate = re.search(r'id="__VIEWSTATE".*?value="([^"]*)"', html)
    viewstategen = re.search(r'id="__VIEWSTATEGENERATOR".*?value="([^"]*)"', html)
    return {
        '__VIEWSTATE': viewstate.group(1) if viewstate else '',
        '__VIEWSTATEGENERATOR': viewstategen.group(1) if viewstategen else '',
    }

def login(username, password):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=ctx),
    )
    opener.addheaders = [
        ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
        ('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
        ('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8'),
    ]

    # --- Step 1: GET login page ---
    print("[1] GET /Login ...")
    resp = opener.open(f"{BASE_URL}/Login")
    login_html = resp.read().decode('utf-8')
    form_state = get_input_names(login_html)
    print(f"    VIEWSTATE: {form_state['__VIEWSTATE'][:40]}...")
    print(f"    VIEWSTATEGENERATOR: {form_state['__VIEWSTATEGENERATOR']}")

    # --- Step 2: POST credentials ---
    print(f"[2] POST /Login (user={username}) ...")
    post_data = {
        '__VIEWSTATE': form_state['__VIEWSTATE'],
        '__VIEWSTATEGENERATOR': form_state['__VIEWSTATEGENERATOR'],
        'wesLogin$loginWes$UserName': username,
        'wesLogin$loginWes$Password': password,
        'wesLogin$loginWes$LoginButton': 'Acessar',
    }
    # ASP.NET postback expects the __doPostBack target
    post_data['__EVENTTARGET'] = 'wesLogin$loginWes$LoginButton'
    post_data['__EVENTARGUMENT'] = ''

    encoded = urllib.parse.urlencode(post_data).encode('utf-8')
    resp = opener.open(f"{BASE_URL}/Login", data=encoded)
    auth_result = resp.read().decode('utf-8', errors='replace')

    # Check if login succeeded (no login form = success)
    if 'Identifique-se' in auth_result and 'Usuário' in auth_result:
        # Could also be an error - check for validation messages
        if 'class="alert' in auth_result.lower() or 'inválido' in auth_result.lower():
            print("[!] Login parece ter falhado - mensagem de erro encontrada")
            # Print any alert divs
            for m in re.finditer(r'<div[^>]*alert[^>]*>.*?</div>', auth_result, re.DOTALL):
                print(f"    ERRO: {m.group()[:200]}")
            return None
        print("[!] Login falhou - página de login retornada novamente")
        return None

    print("    Login OK! Cookies:", [c.name for c in cj])
    return opener, cj

def fetch_solicitacao(opener, key):
    """Acessa a página de uma solicitação específica"""
    url = f"{BASE_URL}/siscon/e/solicitacoes/Solicitacao.aspx?key={key}&p=1"
    print(f"[3] GET {url} ...")
    resp = opener.open(url)
    html = resp.read().decode('utf-8', errors='replace')
    
    # Save for inspection
    out_path = f"solicitacao_{key}.html"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"    HTML salvo em {out_path} ({len(html)} bytes)")
    return html

def fetch_listagem(opener):
    """Tenta acessar a página de listagem 'Minhas' solicitações"""
    # The dashboard/list page - try common URLs
    urls_to_try = [
        f"{BASE_URL}/siscon/",
        f"{BASE_URL}/siscon/e/solicitacoes/",
        f"{BASE_URL}/siscon/e/solicitacoes/Solicitacao.aspx",
        f"{BASE_URL}/siscon/e/",
    ]
    for url in urls_to_try:
        try:
            print(f"[4] GET {url} ...")
            resp = opener.open(url)
            html = resp.read().decode('utf-8', errors='replace')
            out_path = "listagem.html"
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"    HTML salvo em {out_path} ({len(html)} bytes)")
            return html
        except Exception as e:
            print(f"    {type(e).__name__}: {e}")
    return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Uso: python test-auth.py <usuario> <senha>")
        sys.exit(1)

    result = login(sys.argv[1], sys.argv[2])
    if result:
        opener, cj = result
        fetch_listagem(opener)
        fetch_solicitacao(opener, "2580974")
        fetch_solicitacao(opener, "2584906")
        fetch_solicitacao(opener, "2570528")
    else:
        sys.exit(1)
