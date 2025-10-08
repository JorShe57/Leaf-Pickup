#!/bin/bash

# Helper script to move generated icons to the correct location
# Usage: ./move-icons.sh

echo "🍂 Leaf Tracker - Icon Mover"
echo "================================"
echo ""

# Check if icons exist in Downloads
if ls ~/Downloads/icon-*.png 1> /dev/null 2>&1; then
    echo "✅ Found icon files in Downloads folder"
    echo ""
    
    # Count icons
    icon_count=$(ls ~/Downloads/icon-*.png | wc -l | tr -d ' ')
    echo "📦 Found $icon_count icon files"
    echo ""
    
    # List the icons
    echo "Icons to move:"
    ls -1 ~/Downloads/icon-*.png | xargs -n 1 basename
    echo ""
    
    # Move icons
    echo "Moving icons to public/icons/..."
    mv ~/Downloads/icon-*.png public/icons/
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Success! Icons moved to public/icons/"
        echo ""
        echo "Verifying..."
        ls -1 public/icons/icon-*.png 2>/dev/null | wc -l | xargs echo "Icons in public/icons/:"
        echo ""
        
        if [ $(ls -1 public/icons/icon-*.png 2>/dev/null | wc -l) -eq 8 ]; then
            echo "🎉 Perfect! All 8 icons are in place!"
            echo ""
            echo "Next steps:"
            echo "1. Deploy your app: vercel deploy"
            echo "2. Test on mobile device"
            echo "3. Install to home screen"
        else
            echo "⚠️  Warning: Expected 8 icons but found $(ls -1 public/icons/icon-*.png 2>/dev/null | wc -l)"
            echo "Make sure you generated all icons from generate-icons.html"
        fi
    else
        echo "❌ Error moving icons. Check permissions."
    fi
else
    echo "❌ No icon files found in ~/Downloads/"
    echo ""
    echo "Please generate icons first:"
    echo "1. Open generate-icons.html in your browser"
    echo "2. Click 'Generate All Icons' button"
    echo "3. Run this script again"
    echo ""
    echo "Or open the generator now:"
    echo "   open generate-icons.html"
fi

echo ""
