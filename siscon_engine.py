#!/usr/bin/env python
"""
SISCON Monitor - Core engine
- Login automático (ASP.NET Forms Auth)
- Extrai listagem de solicitações do Consultar.aspx
- Detecta itens novos e mudanças de status
"""

import re
import json
import os
import ssl
import html
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime

BASE_URL = "https://siscon.benner.com.br"
STATE_FILE = os.path.join(os.path.dirname(__file__), "siscon_state.json")

class SISCONClient:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cj),
            urllib.request.HTTPSHandler(context=self.ctx),
        )
        self.opener.addheaders = [
            ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
            ('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
            ('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8'),
        ]
        self._logged_in = False

    def _get_viewstate(self, html):
        vs = re.search(r'__VIEWSTATE.*?value="([^"]*)"', html)
        vg = re.search(r'__VIEWSTATEGENERATOR.*?value="([^"]*)"', html)
        return vs.group(1) if vs else '', vg.group(1) if vg else ''

    def login(self):
        """Autentica no SISCON"""
        resp = self.opener.open(f"{BASE_URL}/Login")
        html = resp.read().decode('utf-8', errors='replace')
        vs, vg = self._get_viewstate(html)

        data = {
            '__VIEWSTATE': vs,
            '__VIEWSTATEGENERATOR': vg,
            'wesLogin$loginWes$UserName': self.username,
            'wesLogin$loginWes$Password': self.password,
            '__EVENTTARGET': 'wesLogin$loginWes$LoginButton',
            '__EVENTARGUMENT': '',
        }
        resp = self.opener.open(f"{BASE_URL}/Login", data=urllib.parse.urlencode(data).encode('utf-8'))
        result = resp.read().decode('utf-8', errors='replace')
        
        if 'Identifique-se' in result:
            raise Exception("Falha no login - página de login retornada")
        
        self._logged_in = True
        return True

    def _ensure_login(self):
        if not self._logged_in:
            self.login()

    def fetch_solicitacoes(self):
        """
        Busca a página Consultar.aspx e extrai todas as solicitações.
        Retorna lista de dicts: {protocolo, classificacao, cliente, sistema,
                                versao, resumo, situacao, url}
        """
        self._ensure_login()
        
        resp = self.opener.open(f"{BASE_URL}/siscon/e/Solicitacoes/Consultar.aspx")
        page_html = resp.read().decode('utf-8', errors='replace')
        
        # Extrair rows do grid
        # Cada tr com rel="N" e handle="PROTOCOLO"
        rows = re.findall(
            r'<tr[^>]*?class="default"[^>]*?handle="(\d+)"[^>]*?>(.*?)</tr>',
            page_html, re.DOTALL
        )
        
        solicitacoes = []
        for protocolo, row_html in rows:
            def get_field(field_name):
                m = re.search(
                    rf'data-field="{field_name}"[^>]*?>.*?>(.*?)</a></td>',
                    row_html, re.DOTALL
                )
                if m:
                    # Get title attribute first (has actual text), else inner text
                    title = re.search(r'title="([^"]*)"', m.group(1))
                    if title:
                        return title.group(1).strip()
                    # Otherwise get clean text content
                    text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                    return text
                return ''
            
            solicitacoes.append({
                'protocolo': int(protocolo),
                'classificacao': html.unescape(get_field('CLASSIFICACAO')),
                'cliente': html.unescape(get_field('CLIENTE')),
                'sistema': html.unescape(get_field('SISTEMA')),
                'versao': html.unescape(get_field('VERSAO')),
                'resumo': html.unescape(get_field('RESUMO')),
                'situacao': html.unescape(get_field('SITUACAOATUAL')),
                'url': f"{BASE_URL}/siscon/e/solicitacoes/Solicitacao.aspx?key={protocolo}&p=1",
            })
        
        return solicitacoes


def load_previous_state():
    """Carrega o estado anterior das solicitações"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'solicitacoes': [], 'updated_at': None}

def save_state(solicitacoes):
    """Salva o estado atual"""
    state = {
        'solicitacoes': solicitacoes,
        'updated_at': datetime.now().isoformat(),
    }
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2, default=str)

def compare(previous, current):
    """
    Compara duas listas de solicitações.
    Retorna dict com: novas, removidas, alteradas
    """
    prev_by_id = {s['protocolo']: s for s in previous}
    curr_by_id = {s['protocolo']: s for s in current}
    
    prev_ids = set(prev_by_id.keys())
    curr_ids = set(curr_by_id.keys())
    
    novas = [curr_by_id[pid] for pid in curr_ids - prev_ids]
    removidas = [prev_by_id[pid] for pid in prev_ids - curr_ids]
    
    alteradas = []
    for pid in curr_ids & prev_ids:
        old = prev_by_id[pid]
        new = curr_by_id[pid]
        # Check any field changes
        changes = {}
        for field in ['classificacao', 'cliente', 'sistema', 'versao', 'resumo', 'situacao']:
            if old.get(field) != new.get(field):
                changes[field] = {'de': old.get(field), 'para': new.get(field)}
        if changes:
            alteradas.append({'protocolo': pid, 'url': new['url'], 'alteracoes': changes})
    
    return {
        'novas': novas,
        'removidas': removidas,
        'alteradas': alteradas,
        'total_anterior': len(previous),
        'total_atual': len(current),
        'timestamp': datetime.now().isoformat(),
    }


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Uso: python siscon_engine.py <usuario> <senha>")
        sys.exit(1)
    
    client = SISCONClient(sys.argv[1], sys.argv[2])
    
    print("Autenticando...")
    client.login()
    print("OK!")
    
    print("Buscando solicitações...")
    current = client.fetch_solicitacoes()
    print(f"Encontradas {len(current)} solicitações")
    
    previous_state = load_previous_state()
    previous = previous_state.get('solicitacoes', [])
    
    if previous:
        result = compare(previous, current)
        print(f"\n--- Comparação ---")
        print(f"Anterior: {result['total_anterior']} | Atual: {result['total_atual']}")
        print(f"Novas: {len(result['novas'])}")
        for s in result['novas']:
            print(f"  + #{s['protocolo']} - {s['resumo'][:60]} [{s['situacao']}]")
        print(f"Removidas: {len(result['removidas'])}")
        for s in result['removidas']:
            print(f"  - #{s['protocolo']} - {s['resumo'][:60]}")
        print(f"Alteradas: {len(result['alteradas'])}")
        for s in result['alteradas']:
            print(f"  ~ #{s['protocolo']}: {s['alteracoes']}")
    
    # Salva estado
    save_state(current)
    print(f"\nEstado salvo em {STATE_FILE}")
    
    # Print all current for debugging
    print(f"\n--- Todas as solicitações atuais ---")
    for s in sorted(current, key=lambda x: x['protocolo'], reverse=True):
        print(f"#{s['protocolo']:>7} | {s['classificacao']:20} | {s['cliente']:15} | {s['situacao']:30} | {s['resumo'][:60]}")
