import re

files = [
    'src/ui/Sidebar.ts',
    'src/ui/views/OrdersView.ts',
    'src/ui/views/crm/CrmTarefasView.ts',
    'src/ui/views/crm/CrmAgendaView.ts',
    'src/ui/views/crm/CrmCatalogoView.ts',
    'src/ui/views/crm/CrmRespostasView.ts',
    'src/ui/views/crm/CrmPainelView.ts',
    'src/ui/views/crm/CrmAtividadesView.ts',
]

for f in files:
    with open(f, 'r') as fp:
        content = fp.read()

    # Replace escapeHtml calls with escapeText
    new_content = re.sub(r'\bescapeHtml\(', 'escapeText(', content)

    # Update imports - different path depths
    new_content = re.sub(
        r"import \{([^}]*)escapeHtml([^}]*)\} from '\.\./domain/format'",
        r"import {\1escapeText\2} from '../domain/format'", new_content)
    new_content = re.sub(
        r"import \{([^}]*)escapeHtml([^}]*)\} from '\.\.\./domain/format'",
        r"import {\1escapeText\2} from '../../../domain/format'", new_content)
    new_content = re.sub(
        r"import \{([^}]*)escapeHtml([^}]*)\} from '\.\.\.\./domain/format'",
        r"import {\1escapeText\2} from '../../../../domain/format'", new_content)

    if new_content != content:
        with open(f, 'w') as fp:
            fp.write(new_content)
        print(f'Updated {f}')
    else:
        print(f'No changes in {f}')