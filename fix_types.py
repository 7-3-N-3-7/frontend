import re

with open('src/lib/i18n.tsx', 'r') as f:
    content = f.read()

content = content.replace("import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';",
                          "import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';")

with open('src/lib/i18n.tsx', 'w') as f:
    f.write(content)

with open('src/components/LanguageSwitcher.tsx', 'r') as f:
    content = f.read()

content = content.replace("import React from 'react';\n", "")

with open('src/components/LanguageSwitcher.tsx', 'w') as f:
    f.write(content)
