import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Packaging exports of the unchanged approved logos; never modifies app artwork or screenshots. */
class ExportStoreAssets {
    static void draw(Graphics2D g,BufferedImage logo,int x,int y,int width,int height) {
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(logo,x,y,width,height,null);
    }
    public static void main(String[] args)throws Exception {
        File root=new File(args[0]);File dest=new File(root,"release/assets");dest.mkdirs();
        BufferedImage square=ImageIO.read(new File(root,"app/src/main/res/drawable/lae_logo_square.png"));
        BufferedImage wide=ImageIO.read(new File(root,"app/src/main/res/drawable/lae_logo_wide.png"));
        BufferedImage icon=new BufferedImage(512,512,BufferedImage.TYPE_INT_ARGB);
        Graphics2D g=icon.createGraphics();draw(g,square,0,0,512,512);g.dispose();
        ImageIO.write(icon,"png",new File(dest,"icon-512.png"));
        BufferedImage feature=new BufferedImage(1024,500,BufferedImage.TYPE_INT_RGB);
        g=feature.createGraphics();g.setColor(new Color(0x090911));g.fillRect(0,0,1024,500);
        int w=880,h=Math.round(w*(float)wide.getHeight()/wide.getWidth());draw(g,wide,(1024-w)/2,(500-h)/2,w,h);g.dispose();
        ImageIO.write(feature,"png",new File(dest,"feature-1024x500.png"));
        if(new File(dest,"icon-512.png").length()>1024*1024)throw new IllegalStateException("Icon exceeds Play limit");
        System.out.println("Exported unchanged-logo packaging assets: 512x512 RGBA icon; 1024x500 RGB feature graphic.");
    }
}
