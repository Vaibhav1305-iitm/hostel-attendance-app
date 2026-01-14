"""
Fix corrupted index.html by removing orphaned CSS
and ensuring proper HTML structure.
"""

import re

# Read the file
with open(r'e:\Apps Code\New_mobile_Attendance - Copy (10)\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the head section and body section
# The file has CSS code between </head> and the actual body content

# Strategy: 
# 1. Find the first <body> tag
# 2. Find the actual Navigation Drawer HTML (starts with <div class="drawer-overlay")
# 3. Keep everything before first <body> and everything from Navigation Drawer onwards

# Find the position of first </head>
head_end_match = re.search(r'</head>\s*\n', content)
if not head_end_match:
    print("Could not find </head>")
    exit(1)
head_end_pos = head_end_match.end()

# Find the actual body content - looks for the Navigation Drawer
body_content_match = re.search(r'<body>\s*\n\s*<!-- Navigation Drawer -->\s*\n\s*<div class="drawer-overlay"', content)
if not body_content_match:
    # Try alternative pattern - sometimes there's a second <body> tag
    body_content_match = re.search(r'<body>\s*\n\s*<!-- Navigation Drawer -->', content)
    if not body_content_match:
        # Find the second <body> if exists
        all_body_tags = list(re.finditer(r'<body>', content))
        if len(all_body_tags) >= 2:
            # Use the second body tag's position
            second_body_pos = all_body_tags[1].start()
            body_content_start = second_body_pos
        else:
            print("Could not find body content start")
            exit(1)
    else:
        body_content_start = body_content_match.start()
else:
    body_content_start = body_content_match.start()

# Build the clean content
# Keep: everything up to </head>, then the content from the real <body> onwards
clean_content = content[:head_end_pos] + "\n" + content[body_content_start:]

# Write the fixed file
with open(r'e:\Apps Code\New_mobile_Attendance - Copy (10)\index.html', 'w', encoding='utf-8') as f:
    f.write(clean_content)

print("File fixed successfully!")
print(f"Removed approximately {len(content) - len(clean_content)} characters of orphaned CSS")
