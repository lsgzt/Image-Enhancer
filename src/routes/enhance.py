
from flask import Blueprint, request, jsonify, send_file
from gradio_client import Client, handle_file
import os
import shutil
import tempfile

enhance_bp = Blueprint('enhance', __name__)

@enhance_bp.route('/enhance_image', methods=['POST'])
def enhance_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    image_file = request.files['image']
    if image_file.filename == '':
        return jsonify({'error': 'No selected image file'}), 400

    try:
        # Save the uploaded image to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix="." + image_file.filename.rsplit('.', 1)[1].lower()) as temp_input_file:
            image_file.save(temp_input_file.name)
            photo_path = temp_input_file.name

        # Extract parameters from the request
        face_align = request.form.get('face_align', 'false').lower() == 'true'
        background_enhance = request.form.get('background_enhance', 'false').lower() == 'true'
        face_upsample = request.form.get('face_upsample', 'false').lower() == 'true'
        upscale = int(request.form.get('upscale', 2))
        codeformer_fidelity = float(request.form.get('codeformer_fidelity', 0.5))

        # Initialize the Gradio client
        # IMPORTANT: Replace with your actual Hugging Face token or use environment variable
        # For now, using a placeholder token. User will need to provide their own.
        hf_token = os.environ.get("HF_TOKEN", "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") # Placeholder token
        client = Client("sczhou/CodeFormer", hf_token=hf_token)

        # Submit the job
        job = client.submit(
            image=handle_file(photo_path),
            face_align=face_align,
            background_enhance=background_enhance,
            face_upsample=face_upsample,
            upscale=upscale,
            codeformer_fidelity=codeformer_fidelity,
            api_name="/predict"
        )

        result = job.result()

        if isinstance(result, str) and result.endswith(".webp"):
            # Extract the hash and filename from the server path
            path_parts = result.split("/")
            file_hash = path_parts[-2]
            filename = path_parts[-1]

            # Construct the local temp path where gradio_client downloads the file
            # This assumes gradio_client downloads to a temp directory structure like /tmp/gradio/<hash>/<filename>
            temp_base_dir = os.path.join(tempfile.gettempdir(), "gradio")
            local_temp_path = os.path.join(temp_base_dir, file_hash, filename)

            if os.path.exists(local_temp_path):
                # Create a new temporary file for the enhanced image to send back
                with tempfile.NamedTemporaryFile(delete=False, suffix=".webp") as enhanced_output_file:
                    shutil.move(local_temp_path, enhanced_output_file.name)
                    enhanced_image_path = enhanced_output_file.name

                return send_file(enhanced_image_path, mimetype='image/webp', as_attachment=True, download_name='enhanced_image.webp')
            else:
                return jsonify({'error': f'Enhanced file not found at: {local_temp_path}'}), 500
        else:
            return jsonify({'error': 'Unexpected result format from CodeFormer API', 'result': result}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up the temporary input file
        if 'photo_path' in locals() and os.path.exists(photo_path):
            os.remove(photo_path)
        # Clean up the temporary enhanced output file if it was created
        if 'enhanced_image_path' in locals() and os.path.exists(enhanced_image_path):
            os.remove(enhanced_image_path)



