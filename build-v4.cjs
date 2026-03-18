/**
 * Build script for mitzui-360 v4.0
 * Writes the complete App.tsx file
 */
const fs = require('fs');
const path = require('path');

const content = `/**
 * \u05DE\u05D9\u05E6\u05D5\u05D9 360 \u2014 v4.0
 * \u05DB\u05DC\u05D9 \u05DE\u05D9\u05E6\u05D5\u05D9 \u05D6\u05DB\u05D5\u05D9\u05D5\u05EA \u05DC\u05E4\u05E7\u05D9\u05D3\u05D9 \u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9
 * No data persistence
 */
import React, { useState, useMemo, useCallback, useRef, Fragment } from 'react';
`;

fs.writeFileSync(path.join(__dirname, 'src', 'App.tsx'), content, 'utf8');
console.log('Test write OK');
