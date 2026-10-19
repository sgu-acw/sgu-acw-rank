import java.io.PrintWriter;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.eclipse.jdt.internal.compiler.CompilationResult;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.DefaultErrorHandlingPolicies;
import org.eclipse.jdt.internal.compiler.ICompilerRequestor;
import org.eclipse.jdt.internal.compiler.batch.CompilationUnit;
import org.eclipse.jdt.internal.compiler.batch.FileSystem;
import org.eclipse.jdt.internal.compiler.impl.CompilerOptions;
import org.eclipse.jdt.internal.compiler.env.ICompilationUnit;
import org.eclipse.jdt.internal.compiler.problem.DefaultProblemFactory;

/** Trusted bridge only; user Main.java is compiled by the JDK inside the WASM VM. */
public final class JudgeProbe {
    /** Which provider classes resolve via plain Class.forName: 1/2/4 bitmask. */
    public static int providerCheck() {
        String[] names = {
            "jdk.nio.zipfs.ZipFileSystemProvider",
            "jdk.internal.jrtfs.JrtFileSystemProvider",
            "sun.util.resources.cldr.provider.CLDRLocaleDataMetaInfo",
        };
        int score = 0;
        for (int i = 0; i < names.length; i++) {
            try { Class.forName(names[i]); score |= (1 << i); }
            catch (Throwable t) { System.out.println("NO " + names[i] + " -> " + t); }
        }
        return score;
    }

    /** Probe which resource-loading paths work: 1=class dir entry, 2=classpath jar entry. */
    public static int resourceTest() {
        int score = 0;
        try {
            if (JudgeProbe.class.getResourceAsStream("/JudgeProbe.class") != null) score += 1;
        } catch (Throwable t) { t.printStackTrace(); }
        try {
            if (JudgeProbe.class.getResourceAsStream(
                "/org/eclipse/jdt/internal/compiler/batch/messages.properties") != null) score += 2;
        } catch (Throwable t) { t.printStackTrace(); }
        try {
            java.io.InputStream r = JudgeProbe.class.getResourceAsStream(
                "/org/eclipse/jdt/internal/compiler/parser/parser1.rsc");
            if (r != null) { System.out.println("parser1.rsc available=" + r.available()); score += 4; }
        } catch (Throwable t) { t.printStackTrace(); }
        return score;
    }

    /**
     * ECJ 底层编译 API：自建 FileSystem（扁平 JDK jar 当普通 classpath），
     * 绕开 --system/jrtfs 的模块层 provider 绑定。target 为 -DjavaLevel 传入。
     */
    public static int compile() {
        try {
            System.setProperty("java.locale.providers", "JRE");
            String target = "21";
            try {
                target = new String(java.nio.file.Files.readAllBytes(
                    java.nio.file.Paths.get("/judge-target")), "UTF-8").trim();
            } catch (Throwable ignored) { }
            String jdkJar = "/jdk23.jar";
            try {
                jdkJar = new String(java.nio.file.Files.readAllBytes(
                    java.nio.file.Paths.get("/judge-jdk")), "UTF-8").trim();
            } catch (Throwable ignored) { }

            Map<String, String> opts = new HashMap<>();
            opts.put(CompilerOptions.OPTION_Compliance, target);
            opts.put(CompilerOptions.OPTION_Source, target);
            opts.put(CompilerOptions.OPTION_TargetPlatform, target);
            opts.put(CompilerOptions.OPTION_Encoding, "UTF-8");
            opts.put(CompilerOptions.OPTION_ReportUnusedImport, "ignore");
            opts.put(CompilerOptions.OPTION_ReportDeprecation, "ignore");

            CompilerOptions options = new CompilerOptions(opts);
            options.parseLiteralExpressionsAsConstants = true;
            options.verbose = false;
            options.produceReferenceInfo = false;
            options.generateClassFiles = true;

            FileSystem fs = new FileSystem(
                new String[] { jdkJar, "/" }, new String[] { "UTF-8" }, null);

            ICompilationUnit unit = new CompilationUnit(
                new String(java.nio.file.Files.readAllBytes(
                    java.nio.file.Paths.get("/Main.java")), "UTF-8").toCharArray(),
                "Main.java", "UTF-8", "/out", true, null);

            ICompilerRequestor requestor = result -> {
                if (result.hasErrors()) {
                    PrintWriter w = new PrintWriter(System.err, true);
                    for (org.eclipse.jdt.core.compiler.CategorizedProblem p
                            : result.getErrors()) {
                        w.println(p.getMessage() + " (line " + p.getSourceLineNumber() + ")");
                    }
                    return;
                }
                for (org.eclipse.jdt.internal.compiler.ClassFile cf : result.getClassFiles()) {
                    try {
                        String relName = String.valueOf(cf.fileName());
                        if (!relName.endsWith(".class")) relName += ".class";
                        java.io.File destFile = new java.io.File("/out", relName);
                        destFile.getParentFile().mkdirs();
                        try (java.io.FileOutputStream fos = new java.io.FileOutputStream(destFile)) {
                            fos.write(cf.getBytes());
                        }
                    } catch (Throwable t) {
                        t.printStackTrace();
                    }
                }
            };

            new Compiler(fs, DefaultErrorHandlingPolicies.exitOnFirstError(),
                    options, requestor, new DefaultProblemFactory(Locale.ROOT))
                .compile(new ICompilationUnit[] { unit });
            return java.nio.file.Files.exists(
                java.nio.file.Paths.get("/out/Main.class")) ? 0 : 1;
        } catch (Throwable failure) {
            failure.printStackTrace();
            return -777;
        }
    }

    public static int run() {
        try {
            // CLDR provider 依赖模块层 ServiceLoader；算法输入只需要基础 locale 数据。
            System.setProperty("java.locale.providers", "JRE");
            Method main = Class.forName("Main").getMethod("main", String[].class);
            main.invoke(null, (Object) new String[0]);
            return 0;
        } catch (Throwable failure) {
            failure.printStackTrace();
            return -778;
        }
    }
}
