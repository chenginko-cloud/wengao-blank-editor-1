"""从共用模板生成原有入口，按资源内容自动更新缓存版本。"""
from pathlib import Path
from hashlib import sha256

HERE = Path(__file__).resolve().parent


def build():
    template = (HERE / 'template.html').read_text(encoding='utf-8')
    names = ('route.js', 'editor.css', 'model.js', 'app.js', 'sync.js')
    assets = []
    for name in names:
        revision = sha256((HERE / name).read_bytes()).hexdigest()[:12]
        if name.endswith('.css'):
            assets.append(f'<link rel="stylesheet" href="{name}?rev={revision}">')
        else:
            defer = '' if name == 'route.js' else ' defer'
            assets.append(f'<script src="{name}?rev={revision}"{defer}></script>')
    for token in ('__ASSETS__', '__BODY_CLASS__'):
        if template.count(token) != 1:
            raise ValueError('模板占位符异常：' + token)
    for name, body_class in (('desktop.html', ''), ('mobile.html', ' class="mobilePage"')):
        page = template.replace('__ASSETS__', '\n'.join(assets)).replace('__BODY_CLASS__', body_class)
        (HERE / name).write_text(page, encoding='utf-8')
    index = (HERE / 'index.template.html').read_text(encoding='utf-8')
    if index.count('__ROUTE__') != 1:
        raise ValueError('首页模板占位符异常')
    route = (HERE / 'route.js').read_text(encoding='utf-8')
    (HERE / 'index.html').write_text(index.replace('__ROUTE__', '<script>\n' + route + '</script>'), encoding='utf-8')
    (HERE / '.nojekyll').touch()
    print('已生成原有页面入口和资源版本。')


if __name__ == '__main__':
    build()
