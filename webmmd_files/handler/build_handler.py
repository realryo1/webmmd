import sys, re
sys.path.insert(0, r'c:\Users\realryo1\Desktop\mmd\webmmd_files\handler')
from format_js import format_js

LOGIC_JS = r'c:\Users\realryo1\Desktop\mmd\webmmd_files\logic.js'
HANDLER_JS = r'c:\Users\realryo1\Desktop\mmd\webmmd_files\handler.js'

with open(LOGIC_JS, encoding='utf-8') as f:
    lines = f.readlines()

# --- Step 1: Extract handler section (line 3742 partial + lines 3743-3771) ---
l3742 = lines[3741]
hd_pos = l3742.rfind('var Hd=')
handler_raw = l3742[hd_pos:]
for svg_line in lines[3742:3770]:
    handler_raw += svg_line
handler_raw += lines[3770]  # line 3771
# Remove trailing export{Ru as t}
handler_raw = re.sub(r'export\{Ru as t\}\s*;?\s*$', '', handler_raw.rstrip())

# --- Step 2: Format handler content ---
formatted_body = format_js(handler_raw)

# --- Step 3: Build handler.js ---
deps = ['jd','mu','Il','Wl','zu','gu','pu','wd','xd','bd','Bu','td','ad','ed','id','Sd','Cd','Td','Ul','Hl','Vl','Bl','Yl','_u','Ru']
import_line = "import {" + ", ".join(deps) + "} from './logic.js';\n"
handler_content = import_line + "\n" + formatted_body
with open(HANDLER_JS, 'w', encoding='utf-8') as f:
    f.write(handler_content)
print(f"handler.js written: {handler_content.count(chr(10))} lines")

# --- Step 4: Modify logic.js ---
# Truncate line 3742 at hd_pos (remove 'var Hd=...' to end)
new_l3742 = l3742[:hd_pos].rstrip('\n') + '\n'
# Remove lines 3743-3771 (indices 3742-3770), add export statement
export_stmt = "export{" + ",".join(deps) + "};\n"
new_lines = lines[:3741] + [new_l3742] + [export_stmt]
with open(LOGIC_JS, 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(new_lines)
print(f"logic.js rewritten: {len(new_lines)} lines")
print("Done.")
