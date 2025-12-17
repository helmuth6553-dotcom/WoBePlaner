from PIL import Image
import os

def trim_and_resize(input_path, output_dir):
    print(f"Processing {input_path}...")
    
    try:
        img = Image.open(input_path)
        
        # Convert to RGBA if not already
        img = img.convert("RGBA")
        
        # Get the bounding box of the non-zero regions (content)
        # This effectively trims transparent borders
        bbox = img.getbbox()
        
        if bbox:
            print(f"Original size: {img.size}")
            print(f"Found content at: {bbox}")
            
            # Crop to content
            cropped = img.crop(bbox)
            
            # Create a square canvas based on the largest dimension of the cropped content
            # This ensures the aspect ratio is preserved
            max_dim = max(cropped.size)
            # Add a little padding (10%) so it's not touching the very edges
            padding = int(max_dim * 0.1)
            canvas_size = max_dim + (padding * 2)
            
            # Create new blank (transparent) square image
            square_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
            
            # Paste cropped logo in the center
            offset = ((canvas_size - cropped.size[0]) // 2, (canvas_size - cropped.size[1]) // 2)
            square_img.paste(cropped, offset)
            
            print("Generating icons...")
            
            # 1. Generate 192x192
            icon192 = square_img.resize((192, 192), Image.Resampling.LANCZOS)
            icon192.save(os.path.join(output_dir, "icon-192.png"), optimize=True)
            print("Saved icon-192.png")
            
            # 2. Generate 512x512
            icon512 = square_img.resize((512, 512), Image.Resampling.LANCZOS)
            icon512.save(os.path.join(output_dir, "icon-512.png"), optimize=True)
            print("Saved icon-512.png")
            
            # 3. Generate Apple Touch Icon (180x180, white background preferred by iOS)
            apple_img = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))
            apple_img.paste(cropped, offset, mask=cropped)
            apple_icon = apple_img.resize((180, 180), Image.Resampling.LANCZOS)
            apple_icon.save(os.path.join(output_dir, "apple-touch-icon.png"), optimize=True)
            print("Saved apple-touch-icon.png")

            print("Done! Icons are now optimized and frame-filling.")
            
        else:
            print("Error: Image seems to be completely empty/transparent.")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    trim_and_resize("public/logo2.png", "public")
